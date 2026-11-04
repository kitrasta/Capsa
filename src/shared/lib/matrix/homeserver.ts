import { AutoDiscovery, AutoDiscoveryAction } from 'matrix-js-sdk';
import { requireHomeserverUrl, requireServerName } from './config';

export interface HomeserverConnection {
    homeserverUrl: string;
    serverName: string;
}

export interface LoginTarget extends HomeserverConnection {
    identifier: string;
}

export class HomeserverDiscoveryError extends Error {
    constructor() {
        super('Не удалось определить Matrix-сервер. Проверьте домен в Matrix ID.');
        this.name = 'HomeserverDiscoveryError';
    }
}

export const getCapsaHomeserver = (): HomeserverConnection => ({
    homeserverUrl: requireHomeserverUrl(),
    serverName: requireServerName(),
});

const normalizeHomeserverUrl = (value: unknown): string | null => {
    if (typeof value !== 'string' || value.trim().length === 0) return null;
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password) return null;
        return url.toString().replace(/\/+$/, '');
    } catch {
        return null;
    }
};

const isValidPort = (value?: string): boolean => {
    if (value === undefined) return true;
    const port = Number(value);
    return /^\d+$/.test(value) && Number.isInteger(port) && port >= 1 && port <= 65535;
};

const isValidServerName = (value: string): boolean => {
    if (!value || value.trim() !== value || /[\s@/?#]/.test(value)) return false;

    const ipv6 = /^\[([0-9a-f:.]+)\](?::(\d+))?$/i.exec(value);
    if (ipv6) return ipv6[1].includes(':') && isValidPort(ipv6[2]);
    if (value.startsWith('[') || value.includes(':') && !/:\d+$/.test(value)) return false;

    const match = /^([a-z0-9.-]+)(?::(\d+))?$/i.exec(value);
    if (!match || match[1].length > 253 || match[1].includes('..')) return false;
    const labelsValid = match[1].split('.').every((label) =>
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label),
    );
    return labelsValid && isValidPort(match[2]);
};

export const discoverHomeserver = async (
    serverName: string,
): Promise<HomeserverConnection> => {
    const normalizedServerName = serverName.trim();
    if (!isValidServerName(normalizedServerName)) throw new HomeserverDiscoveryError();

    try {
        const config = await AutoDiscovery.findClientConfig(normalizedServerName);
        const homeserverUrl = normalizeHomeserverUrl(config['m.homeserver']?.base_url);
        if (config['m.homeserver']?.state !== AutoDiscoveryAction.SUCCESS || !homeserverUrl) {
            throw new HomeserverDiscoveryError();
        }
        return { homeserverUrl, serverName: normalizedServerName };
    } catch (error) {
        if (error instanceof HomeserverDiscoveryError) throw error;
        throw new HomeserverDiscoveryError();
    }
};

export const resolveLoginTarget = async (input: string): Promise<LoginTarget> => {
    const identifier = input.trim();
    if (!identifier || /\s/.test(identifier)) {
        throw new Error('Введите логин или полный Matrix ID.');
    }

    if (!identifier.startsWith('@')) {
        if (identifier.includes(':') || !/^[a-z0-9._=\-/+]+$/i.test(identifier)) {
            throw new Error('Введите логин или полный Matrix ID в формате @user:server.');
        }
        return { identifier, ...getCapsaHomeserver() };
    }

    const match = /^@([^:@\s]+):(.+)$/.exec(identifier);
    if (!match?.[1] || !match[2] || !isValidServerName(match[2])) {
        throw new Error('Введите логин или полный Matrix ID в формате @user:server.');
    }
    const serverName = match[2];
    return { identifier, ...await discoverHomeserver(serverName) };
};
