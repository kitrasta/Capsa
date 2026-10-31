// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';

vi.mock('./forms/DirectChatForm', () => ({
    default: ({ onDone }: { onDone: (roomId: string) => void }) => (
        <button onClick={() => onDone('!dm:example.org')}>Завершить DM</button>
    ),
}));
vi.mock('./forms/GroupForm', () => ({ default: () => null }));
vi.mock('./forms/ChannelForm', () => ({ default: () => null }));
vi.mock('./forms/SpaceForm', () => ({ default: () => null }));

import CreateChatModal from './CreateChatModal';

const OpenedRoom = () => {
    const { roomId } = useParams();
    return <div>Открыта комната {roomId}</div>;
};

afterEach(cleanup);

describe('CreateChatModal', () => {
    it('проходит сценарий выбора DM и открывает созданную комнату', () => {
        render(
            <MemoryRouter initialEntries={['/chats']}>
                <CreateChatModal isOpen onClose={vi.fn()} />
                <Routes>
                    <Route path="/chats/:roomId" element={<OpenedRoom />} />
                </Routes>
            </MemoryRouter>,
        );

        fireEvent.click(screen.getByRole('button', { name: /Личный чат/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Завершить DM' }));

        expect(screen.getByText('Открыта комната !dm:example.org')).toBeTruthy();
    });
});
