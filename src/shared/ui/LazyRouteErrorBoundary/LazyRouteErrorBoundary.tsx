import { Component } from 'react';
import type { ReactNode } from 'react';

interface Props {
    children: ReactNode;
    /** инъекция для тестов; в проде — window.location.reload */
    reload?: () => void;
}

interface State {
    failed: boolean;
}

// React.lazy при rejected dynamic import бросает ошибку рендера, которую
// Suspense НЕ ловит. Без boundary это уносит всё приложение — например,
// когда после деплоя старая открытая вкладка просит page-chunk, которого
// уже нет в новом release, или при транзиентном сетевом сбое.
// Полная перезагрузка — единственный надёжный recovery: React.lazy
// кэширует rejected-результат, повторный рендер без reload бесполезен.
class LazyRouteErrorBoundary extends Component<Props, State> {
    state: State = { failed: false };

    static getDerivedStateFromError(): State {
        return { failed: true };
    }

    componentDidCatch(error: unknown): void {
        console.error('Lazy route failed to load:', error);
    }

    render(): ReactNode {
        if (this.state.failed) {
            return (
                <div role="alert">
                    <p>
                        Не удалось загрузить страницу. Возможно, вышла новая
                        версия приложения или пропало соединение.
                    </p>
                    <button
                        type="button"
                        onClick={() =>
                            (this.props.reload ?? (() => window.location.reload()))()
                        }
                    >
                        Перезагрузить
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

export default LazyRouteErrorBoundary;
