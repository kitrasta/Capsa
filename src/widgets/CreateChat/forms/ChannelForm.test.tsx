// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../../../shared/lib/matrix', () => ({ createChannel: vi.fn() }));

import ChannelForm from './ChannelForm';
import { createChannel } from '../../../shared/lib/matrix';

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('ChannelForm', () => {
    it('создаёт канал и возвращает roomId для перехода в него', async () => {
        vi.mocked(createChannel).mockResolvedValue('!channel:example.org');
        const onDone = vi.fn();
        render(<ChannelForm onDone={onDone} />);

        fireEvent.change(screen.getByPlaceholderText('Название канала'), {
            target: { value: 'Новости' },
        });
        fireEvent.change(screen.getByPlaceholderText('Описание (необязательно)'), {
            target: { value: 'Новости проекта' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Создать канал' }));
        await act(async () => {
            await Promise.resolve();
        });

        expect(createChannel).toHaveBeenCalledWith('Новости', 'Новости проекта');
        expect(onDone).toHaveBeenCalledWith('!channel:example.org');
    });
});
