// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import MessageBubble from '../MessageBubble';
import { toMessageView, type MessageView } from '../messageView';
import type { MatrixEvent, Room } from 'matrix-js-sdk';

// без vitest-globals RTL не чистит DOM сам
afterEach(cleanup);

const baseView = (id: string, body: string): MessageView => ({
    id,
    body,
    formattedBody: null,
    senderName: 'Alice',
    ts: 1700000000000,
    sendStatus: null,
    isOwn: false,
});

// MessageBubble зовёт toLocaleTimeString при КАЖДОМ своём ре-рендере —
// по числу вызовов считаем, сколько пузырей реально отрендерилось.
// (React.Profiler для этого не годится: его onRender срабатывает и при
// bailout'е memo.)
const countRenders = () => vi.spyOn(Date.prototype, 'toLocaleTimeString');

const BubbleList = ({ views }: { views: MessageView[] }) => (
    <>
        {views.map((view) => (
            <MessageBubble key={view.id} {...view} />
        ))}
    </>
);

describe('MessageBubble: memo', () => {
    it('рендерит данные пузыря (текст, имя, статус)', () => {
        const { getByText } = render(
            <BubbleList views={[{ ...baseView('m1', 'hello'), sendStatus: '✓' }]} />,
        );

        getByText('hello');
        getByText('Alice');
        getByText('✓');
    });

    it('не перерисовывает пузыри, если видимые данные не менялись', () => {
        const spy = countRenders();
        const views = [baseView('m1', 'hello'), baseView('m2', 'world')];
        const { rerender } = render(<BubbleList views={views} />);
        expect(spy).toHaveBeenCalledTimes(2); // по разу на каждый пузырь

        // родитель перерендерился, но данные те же (новые объекты, значения равны)
        rerender(<BubbleList views={[baseView('m1', 'hello'), baseView('m2', 'world')]} />);

        expect(spy).toHaveBeenCalledTimes(2); // ни одного нового ре-рендера
    });
});

describe('MessageBubble: расшифровка', () => {
    it('перерисовывается ТОЛЬКО расшифрованный пузырь, и он показывает текст', () => {
        const spy = countRenders();
        // m2 пришёл как m.room.encrypted → тела ещё нет
        const { rerender, getByText } = render(
            <BubbleList views={[baseView('m1', 'hello'), baseView('m2', '')]} />,
        );
        expect(spy).toHaveBeenCalledTimes(2);

        // расшифровка m2: у него появилось тело
        rerender(
            <BubbleList views={[baseView('m1', 'hello'), baseView('m2', 'secret')]} />,
        );

        // ровно один ре-рендер (итого 3) + контент обновился → это m2,
        // а не сосед: memo не заморозил расшифрованное сообщение
        expect(spy).toHaveBeenCalledTimes(3);
        getByText('secret');
        getByText('hello');
    });

    it('обновляется только свой пузырь и при смене статуса отправки', () => {
        const spy = countRenders();
        const sending: MessageView = { ...baseView('m1', 'hi'), isOwn: true, sendStatus: '🕓' };
        const sent: MessageView = { ...baseView('m1', 'hi'), isOwn: true, sendStatus: '✓' };
        const other = baseView('m2', 'other');

        const { rerender, getByText } = render(<BubbleList views={[sending, other]} />);
        rerender(<BubbleList views={[sent, other]} />);

        expect(spy).toHaveBeenCalledTimes(3); // рендернулся только m1
        getByText('✓');
    });
});

describe('toMessageView', () => {
    const makeEvent = (content: Record<string, unknown>, opts: { sender?: string; ts?: number } = {}) =>
        ({
            getId: () => '$event1',
            getSender: () => opts.sender ?? '@alice:example.org',
            getTs: () => opts.ts ?? 1700000000000,
            getContent: () => content,
            status: undefined,
        }) as unknown as MatrixEvent;

    const makeRoom = (memberName?: string) =>
        ({
            currentState: {
                getMember: () => (memberName ? { name: memberName } : null),
            },
        }) as unknown as Room;

    it('снимает видимые данные события', () => {
        const view = toMessageView(
            makeEvent({ body: 'hello', format: 'org.matrix.custom.html', formatted_body: '<b>hi</b>' }),
            makeRoom('Alice'),
            true,
        );

        expect(view).toEqual({
            id: '$event1',
            body: 'hello',
            formattedBody: '<b>hi</b>',
            senderName: 'Alice',
            ts: 1700000000000,
            sendStatus: null,
            isOwn: true,
        });
    });

    it('без имени участника показывает senderId; sendStatus только у своих', () => {
        const view = toMessageView(makeEvent({ body: 'x' }), makeRoom(), false);

        expect(view.senderName).toBe('@alice:example.org');
        expect(view.formattedBody).toBeNull();
        expect(view.sendStatus).toBeNull();
    });
});
