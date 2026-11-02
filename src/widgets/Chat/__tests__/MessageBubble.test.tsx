// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import MessageBubble from '../MessageBubble';
import { toMessageView, type MessageView } from '../messageView';
import type { MatrixEvent, Room } from 'matrix-js-sdk';

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

const baseView = (id: string, body: string): MessageView => ({
    id,
    body,
    formattedBody: null,
    senderId: '@alice:capsachat.org',
    senderName: 'Alice',
    ts: 1700000000000,
    sendStatus: null,
    isOwn: false,
    isEdited: false,
    replyTo: null,
    reactions: [],
    canEdit: false,
});

// MessageBubble зовёт toLocaleTimeString при каждом своём рендере —
// по числу вызовов считаем, сколько пузырей реально отрендерилось.
const countRenders = () => vi.spyOn(Date.prototype, 'toLocaleTimeString');

const BubbleList = ({ views }: { views: MessageView[] }) => (
    <>
        {views.map((view) => (
            <MessageBubble key={view.id} message={view} />
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
        expect(spy).toHaveBeenCalledTimes(2);

        rerender(<BubbleList views={[baseView('m1', 'hello'), baseView('m2', 'world')]} />);

        expect(spy).toHaveBeenCalledTimes(2);
    });
});

describe('MessageBubble: обновления', () => {
    it('перерисовывается ТОЛЬКО расшифрованный пузырь, и он показывает текст', () => {
        const spy = countRenders();
        const { rerender, getByText } = render(
            <BubbleList views={[baseView('m1', 'hello'), baseView('m2', '')]} />,
        );
        expect(spy).toHaveBeenCalledTimes(2);

        rerender(
            <BubbleList views={[baseView('m1', 'hello'), baseView('m2', 'secret')]} />,
        );

        expect(spy).toHaveBeenCalledTimes(3);
        getByText('secret');
        getByText('hello');
    });

    it('обновляется только свой пузырь при смене статуса отправки', () => {
        const spy = countRenders();
        const sending: MessageView = { ...baseView('m1', 'hi'), isOwn: true, sendStatus: '🕓' };
        const sent: MessageView = { ...baseView('m1', 'hi'), isOwn: true, sendStatus: '✓' };
        const other = baseView('m2', 'other');

        const { rerender, getByText } = render(<BubbleList views={[sending, other]} />);
        rerender(<BubbleList views={[sent, other]} />);

        expect(spy).toHaveBeenCalledTimes(3);
        getByText('✓');
    });

    it('переходит к исходному сообщению, а не к самому ответу', () => {
        const onReplyClick = vi.fn();
        const view: MessageView = {
            ...baseView('$reply', 'Ответ'),
            replyTo: { id: '$original', senderName: 'Alice', body: 'Исходное' },
        };
        const { getByRole } = render(
            <MessageBubble message={view} onReplyClick={onReplyClick} />,
        );

        fireEvent.click(getByRole('button', { name: 'Перейти к ответу' }));

        expect(onReplyClick).toHaveBeenCalledWith('$original');
    });
});

describe('toMessageView', () => {
    const makeEvent = (
        content: Record<string, unknown>,
        opts: {
            sender?: string;
            ts?: number;
            relation?: Record<string, unknown>;
        } = {},
    ) =>
        ({
            getId: () => '$event1',
            getSender: () => opts.sender ?? '@alice:capsachat.org',
            getTs: () => opts.ts ?? 1700000000000,
            getContent: () => content,
            getRelation: () => opts.relation,
            replacingEventId: () => undefined,
            isRedacted: () => false,
            replyEventId: opts.relation?.['m.in_reply_to'],
            status: undefined,
        }) as unknown as MatrixEvent;

    const makeRoom = (memberName?: string) =>
        ({
            currentState: {
                getMember: () => (memberName ? { name: memberName } : null),
            },
            findEventById: () => undefined,
            getUnfilteredTimelineSet: () => ({
                relations: { getChildEventsForEvent: () => undefined },
            }),
        }) as unknown as Room;

    it('снимает видимые данные события', () => {
        const view = toMessageView(
            makeEvent({
                body: 'hello',
                format: 'org.matrix.custom.html',
                formatted_body: '<b>hi</b>',
            }),
            makeRoom('Alice'),
            '@alice:capsachat.org',
        );

        expect(view).toEqual({
            id: '$event1',
            body: 'hello',
            formattedBody: '<b>hi</b>',
            senderId: '@alice:capsachat.org',
            senderName: 'Alice',
            ts: 1700000000000,
            sendStatus: null,
            isOwn: true,
            isEdited: false,
            replyTo: null,
            reactions: [],
            canEdit: false,
        });
    });

    it('без имени участника показывает senderId; sendStatus только у своих', () => {
        const view = toMessageView(makeEvent({ body: 'x' }), makeRoom(), '@me:example.org');

        expect(view.senderId).toBe('@alice:capsachat.org');
        expect(view.senderName).toBe('@alice:capsachat.org');
        expect(view.formattedBody).toBeNull();
        expect(view.sendStatus).toBeNull();
        expect(view.isOwn).toBe(false);
    });

    it('сохраняет MXID отдельно от display name и разрешает правку собственного ответа', () => {
        const view = toMessageView(
            makeEvent(
                { msgtype: 'm.text', body: 'Ответ' },
                {
                    relation: {
                        'm.in_reply_to': { event_id: '$original' },
                    },
                },
            ),
            makeRoom('Alice'),
            '@alice:capsachat.org',
        );

        expect(view.senderId).toBe('@alice:capsachat.org');
        expect(view.senderName).toBe('Alice');
        expect(view.canEdit).toBe(true);
    });

    it.each(['m.replace', 'm.annotation'])(
        'запрещает правку события со связью %s',
        (relType) => {
            const view = toMessageView(
                makeEvent(
                    { msgtype: 'm.text', body: 'Текст' },
                    { relation: { rel_type: relType, event_id: '$target' } },
                ),
                makeRoom('Alice'),
                '@alice:capsachat.org',
            );

            expect(view.canEdit).toBe(false);
        },
    );
});
