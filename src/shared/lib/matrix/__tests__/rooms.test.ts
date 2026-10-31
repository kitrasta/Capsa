import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventType, Preset, Visibility } from 'matrix-js-sdk';
import type { MatrixClient, Room } from 'matrix-js-sdk';

vi.mock('../client', () => ({ getClient: vi.fn() }));

import { getClient } from '../client';
import { createChannel, createDirectChat, createGroup } from '../api/rooms';

const ME = '@me:example.org';
const ALICE = '@alice:example.org';

const makeClient = (directContent: Record<string, string[]> = {}) => {
    const client = {
        getAccountData: vi.fn(() => ({ getContent: () => directContent })),
        getRoom: vi.fn((): Room | undefined => undefined),
        getRooms: vi.fn((): Room[] => []),
        getUserId: vi.fn(() => ME),
        createRoom: vi.fn(async () => ({ room_id: '!created:example.org' })),
        setAccountData: vi.fn(async () => ({})),
    };
    vi.mocked(getClient).mockReturnValue(client as unknown as MatrixClient);
    return client;
};

beforeEach(() => {
    vi.mocked(getClient).mockReset();
});

describe('createDirectChat', () => {
    it('открывает существующий DM из m.direct вместо создания дубликата', async () => {
        const client = makeClient({ [ALICE]: ['!existing:example.org'] });
        client.getRoom.mockReturnValue({
            getMyMembership: () => 'join',
        } as Room);

        await expect(createDirectChat(ALICE)).resolves.toBe('!existing:example.org');

        expect(client.createRoom).not.toHaveBeenCalled();
        expect(client.setAccountData).not.toHaveBeenCalled();
    });

    it('находит старый DM по is_direct, если записи m.direct ещё нет', async () => {
        const client = makeClient();
        client.getRooms.mockReturnValue([
            {
                roomId: '!legacy:example.org',
                getMyMembership: () => 'join',
                getMember: (userId: string) =>
                    userId === ALICE ? { getDMInviter: () => ME } : undefined,
            } as unknown as Room,
        ]);

        await expect(createDirectChat(ALICE)).resolves.toBe('!legacy:example.org');

        expect(client.createRoom).not.toHaveBeenCalled();
    });

    it('создаёт зашифрованный DM и сохраняет его в m.direct', async () => {
        const client = makeClient();

        await expect(createDirectChat(ALICE)).resolves.toBe('!created:example.org');

        expect(client.createRoom).toHaveBeenCalledWith({
            invite: [ALICE],
            is_direct: true,
            preset: Preset.TrustedPrivateChat,
            initial_state: [
                {
                    type: 'm.room.encryption',
                    state_key: '',
                    content: { algorithm: 'm.megolm.v1.aes-sha2' },
                },
            ],
        });
        expect(client.setAccountData).toHaveBeenCalledWith(EventType.Direct, {
            [ALICE]: ['!created:example.org'],
        });
    });
});

describe('createGroup', () => {
    it('создаёт приватную группу с выбранными участниками', async () => {
        const client = makeClient();

        await expect(createGroup('Команда', [ALICE])).resolves.toBe('!created:example.org');

        expect(client.createRoom).toHaveBeenCalledWith({
            name: 'Команда',
            invite: [ALICE],
            preset: Preset.PrivateChat,
        });
    });
});

describe('createChannel', () => {
    it('создаёт публичный канал, где писать могут только администраторы', async () => {
        const client = makeClient();

        await expect(createChannel('Новости', 'Описание')).resolves.toBe(
            '!created:example.org',
        );

        expect(client.createRoom).toHaveBeenCalledWith({
            name: 'Новости',
            topic: 'Описание',
            visibility: Visibility.Public,
            preset: Preset.PublicChat,
            power_level_content_override: {
                events: { [EventType.RoomMessage]: 100 },
            },
        });
    });
});
