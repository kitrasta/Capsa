// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useRoomDraft } from '../useRoomDraft';

const USER = '@me:example.org';
const ROOM_A = '!a:example.org';
const ROOM_B = '!b:example.org';

beforeEach(() => {
    localStorage.clear();
});

afterEach(() => {
    cleanup();
    localStorage.clear();
});

describe('useRoomDraft', () => {
    it('восстанавливает текст, ответ и правку после повторного открытия комнаты', () => {
        const first = renderHook(() => useRoomDraft(ROOM_A, USER));
        act(() => {
            first.result.current.setText('Черновик');
            first.result.current.setReplyDraft({
                id: '$reply',
                senderName: 'Alice',
                body: 'Исходное сообщение',
            });
            first.result.current.setEditDraft({ id: '$edit', body: 'Старый текст' });
        });
        first.unmount();

        const second = renderHook(() => useRoomDraft(ROOM_A, USER));

        expect(second.result.current.text).toBe('Черновик');
        expect(second.result.current.replyDraft).toEqual({
            id: '$reply',
            senderName: 'Alice',
            body: 'Исходное сообщение',
        });
        expect(second.result.current.editDraft).toEqual({
            id: '$edit',
            body: 'Старый текст',
        });
    });

    it('хранит черновики комнат независимо', () => {
        const roomA = renderHook(() => useRoomDraft(ROOM_A, USER));
        act(() => roomA.result.current.setText('Для комнаты A'));
        roomA.unmount();

        const roomB = renderHook(() => useRoomDraft(ROOM_B, USER));
        expect(roomB.result.current.text).toBe('');
        act(() => roomB.result.current.setText('Для комнаты B'));
        roomB.unmount();

        const reopenedA = renderHook(() => useRoomDraft(ROOM_A, USER));
        expect(reopenedA.result.current.text).toBe('Для комнаты A');
    });

    it('не показывает черновик другого аккаунта', () => {
        const first = renderHook(() => useRoomDraft(ROOM_A, USER));
        act(() => first.result.current.setText('Личный черновик'));
        first.unmount();

        const otherAccount = renderHook(() =>
            useRoomDraft(ROOM_A, '@other:example.org'),
        );

        expect(otherAccount.result.current.text).toBe('');
    });

    it('удаляет запись после полной очистки черновика', () => {
        const { result } = renderHook(() => useRoomDraft(ROOM_A, USER));
        act(() => result.current.setText('Временный текст'));
        expect(localStorage.length).toBe(1);

        act(() => result.current.setText(''));

        expect(localStorage.length).toBe(0);
    });
});
