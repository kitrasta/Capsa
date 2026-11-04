# Регистрация Capsa и вход через произвольные homeserver'ы

Дата: 2026-11-05  
Статус: ожидает подтверждения

## 1. Назначение

Новый пользователь должен иметь возможность открыть Capsa, создать аккаунт на `capsachat.org`, подтвердить email и попасть в чаты без участия администратора. Существующий пользователь другого Matrix-homeserver'а должен входить в Capsa своим Matrix ID и паролем, без переноса аккаунта на сервер Capsa.

Это открытая регистрация без приглашений. Подтверждение email обязательно. Resend выбран как SMTP-провайдер; домен `mail.capsachat.org` уже добавлен и подтверждён в Resend.

## 2. Исходные факты

- Capsa — React/TypeScript SPA без собственного backend.
- Сейчас есть только `/auth` с входом по логину и паролю.
- `VITE_MATRIX_HOMESERVER_URL` и `VITE_MATRIX_SERVER_NAME` задают единый сервер на этапе сборки.
- В production-документации сервер Capsa — `https://matrix.capsachat.org`, server name — `capsachat.org`.
- Matrix discovery для Capsa работает: `https://capsachat.org/.well-known/matrix/client` возвращает правильный `base_url`.
- Synapse поддерживает `m.login.password`, но сейчас возвращает `Registration has been disabled`.
- В `/srv/capsa/synapse/homeserver.yaml` установлено `enable_registration: false`; блок email/SMTP отсутствует.
- `matrix-js-sdk` уже содержит `AutoDiscovery`, `InteractiveAuth`, `requestRegisterEmailToken` и `registerRequest`; новые сетевые библиотеки не нужны.
- Сессия сейчас хранит только `accessToken`, `userId`, `deviceId`, поэтому после входа через другой сервер приложение не сможет восстановить правильный `baseUrl` без расширения формата сессии.

## 3. Цели

1. Публичная регистрация только на homeserver'е Capsa.
2. Обязательное подтверждение email до завершения создания аккаунта.
3. Автоматический вход после успешной регистрации.
4. Вход по паролю на любом совместимом homeserver'е через полный Matrix ID.
5. Короткий логин без домена продолжает означать аккаунт на `capsachat.org`.
6. Существующие сохранённые сессии продолжают работать после обновления.
7. Секреты Resend, пароли и access tokens не попадают в Git, журнал команд или логи клиента.
8. Изменение Synapse имеет backup, проверку конфигурации и понятный rollback.

## 4. Не входит в эту задачу

- Отдельный backend Capsa и отдельная база пользователей.
- SSO/OAuth, вход по телефону, регистрация через сторонние homeserver'ы.
- Восстановление пароля по email.
- Капча: обязательный email и rate limits Synapse являются первой защитой; капчу добавляем отдельно при реальном злоупотреблении.
- Перенос аккаунтов между homeserver'ами, смена `server_name` и миграция инфраструктуры.
- Сохранение незавершённой регистрации между перезагрузками страницы.
- Изменение PostgreSQL, Caddy и Matrix discovery, если проверка не выявит конкретную необходимость.
- Будущий лендинг `capsachat.org` и размещение приложения на `web.capsachat.org`; текущая регистрация не должна от них зависеть.

## 5. Рассмотренные подходы

### Выбран: прямой стандартный Matrix API

```text
Capsa → Synapse → Resend SMTP
```

Браузер использует `/register` и User-Interactive Authentication (UIA). Synapse отправляет письмо и проверяет подтверждение. После успеха тот же ответ регистрации возвращает `user_id`, `access_token`, `device_id`; Capsa сохраняет обычную Matrix-сессию.

Плюсы: нет нового backend, пароли не проходят через дополнительный сервис, аккаунты остаются стандартными Matrix-аккаунтами, код использует уже установленный SDK. Позже backend можно поставить перед Synapse без миграции пользователей и сообщений.

### Альтернатива: собственный backend-посредник

```text
Capsa → backend Capsa → Synapse → Resend SMTP
```

Дал бы больше контроля над текстами писем и нестандартными правилами, но требует нового сервиса, секретов, мониторинга и безопасной передачи паролей. Для текущих требований это лишняя сложность. Не выбран.

## 6. Пользовательские сценарии

### 6.1. Вход

`/auth` становится общей страницей аутентификации с вкладками «Вход» и «Регистрация». Адрес при переключении не меняется. Вкладка «Вход» содержит текущую форму.

Поле называется «Matrix ID или логин»:

- `@alice:matrix.org` — определяем server name `matrix.org`, выполняем discovery и входим на найденном API;
- `@alice:capsachat.org` — используем discovery Capsa;
- `alice` — подставляем server name Capsa из production-конфигурации.

После успешного входа сохраняются не только token/user/device, но и нормализованные `homeserverUrl` и `serverName`. После перезагрузки клиент запускается именно на сервере текущего аккаунта.

Если discovery не дал однозначный безопасный результат, вход не выполняется. Показываем понятную ошибку и не подставляем непроверенный URL.

### 6.2. Регистрация

Вкладка «Регистрация» на той же странице `/auth`, визуально согласованная с формой входа. Отдельного маршрута `/register` не будет.

Поля:

- желаемый логин без `@` и домена;
- email;
- пароль;
- повтор пароля.

Клиент проверяет заполнение, корректность email и совпадение паролей до запроса. Силу пароля не дублируем собственными неожиданными правилами: окончательные требования задаёт Synapse.

После отправки:

1. Создаётся временный Matrix client только для homeserver'а Capsa.
2. Запускается `InteractiveAuth<RegisterResponse>` с `inputs.emailAddress`, поддерживаемой стадией `m.login.email.identity` и `doRequest`, вызывающим `registerRequest` с username/password.
3. SDK запрашивает письмо через `requestRegisterEmailToken`; UI переходит в состояние «Проверьте почту».
4. Письмо открывает стандартную страницу подтверждения Synapse. Вкладка Capsa остаётся открытой и периодически вызывает `InteractiveAuth.poll()`.
5. На экране есть повторная отправка письма с cooldown и возможность начать регистрацию заново. Повторная отправка использует тот же UIA session/client secret через SDK, а не создаёт второй аккаунт.
6. После успешного ответа проверяем обязательные поля, сохраняем сессию с сервером Capsa и переходим на `/chats`.

Если страницу перезагрузили до завершения, незавершённая UIA-сессия не восстанавливается: пользователь начинает заново и запрашивает новое письмо.

### 6.3. Ошибки

Отдельно обрабатываем:

- занятый логин (`M_USER_IN_USE`);
- недопустимый логин;
- уже используемый или отклонённый email;
- несовпадение паролей и локальную валидацию;
- отключённую регистрацию;
- неподдерживаемый UIA flow;
- превышение rate limit с предложением попробовать позже;
- сеть/CORS/discovery;
- отсутствие или неверность production-конфигурации Capsa.

Пароли, API key, access token, UIA client secret и sid не выводим в `console.log`. Технические ошибки логируем без чувствительных значений; пользователю показываем короткое русское сообщение.

## 7. Динамический homeserver и обратная совместимость

Добавляется небольшой модуль разрешения сервера:

- парсит короткий логин или полный Matrix ID;
- для полного ID извлекает server name;
- вызывает `AutoDiscovery.findClientConfig(serverName)`;
- принимает только `AutoDiscoveryAction.SUCCESS` с валидным `m.homeserver.base_url`;
- возвращает `{ homeserverUrl, serverName, matrixUserId/localpart }`.

`loginUser` получает разрешённый адрес сервера, а не читает глобальный production URL. `initClient` использует `session.homeserverUrl`.

Формат `MatrixSession` расширяется `homeserverUrl` и `serverName`; они сохраняются в отдельных ключах `capsa.matrix.*`. При чтении старой сессии отсутствующие поля заполняются значениями из `VITE_MATRIX_HOMESERVER_URL` и `VITE_MATRIX_SERVER_NAME`, поэтому текущие пользователи не разлогиниваются. Битые или частичные новые значения по-прежнему очищаются существующей логикой.

`isSameSession` учитывает сервер, чтобы lifecycle не переиспользовал клиент другого homeserver'а. `addRoomToSpace` получает `serverName` текущего аккаунта/клиента вместо статической `MATRIX_SERVER_NAME`.

Production `.env` должен указывать на `https://matrix.capsachat.org` и `capsachat.org`: эти значения являются и значениями по умолчанию для короткого логина, и единственным разрешённым сервером регистрации.

## 8. Настройка Synapse и Resend

На VPS сохраняется резервная копия `homeserver.yaml`, затем конфигурация дополняется эквивалентом:

```yaml
server_name: capsachat.org
public_baseurl: https://matrix.capsachat.org/
enable_registration: true
registrations_require_3pid:
  - email

email:
  smtp_host: smtp.resend.com
  smtp_port: 465
  smtp_user: resend
  smtp_pass: <RESEND_API_KEY>
  require_transport_security: true
  notif_from: "Capsa <no-reply@mail.capsachat.org>"
  app_name: Capsa
```

Точный итоговый YAML сверяется с установленной версией Synapse; существующие значения не перезаписываются слепо. API key Resend помещается оператором в локальный gitignored `.env` как `RESEND_API_KEY`, после чего переносится в защищённую серверную конфигурацию без вывода значения в терминал. Ключ не добавляется в `VITE_*`: переменные Vite попадают в публичный JS-бандл.

После изменения:

1. Проверяются права и YAML/config Synapse.
2. Перезапускается только Synapse; PostgreSQL и Caddy не трогаем без необходимости.
3. Health gate: контейнер работает, `/_matrix/client/versions` и discovery отвечают, логи не содержат SMTP/config fatal errors.
4. Пустой discovery-запрос `/register` теперь должен вернуть UIA flow с `m.login.email.identity`, а не `Registration has been disabled`. Этот запрос не создаёт аккаунт.
5. При ошибке восстанавливаем backup и снова проверяем старый вход.

## 9. Основные места изменения

- `src/pages/LoginPage.tsx`, `LoginPage.module.css` — вкладки «Вход / Регистрация» на `/auth`, полный Matrix ID и discovery.
- Новый `src/widgets/Auth/RegistrationForm.tsx` и CSS module — форма, email pending, resend/poll внутри `/auth`.
- `src/app/router/app-router.tsx` сохраняет единый auth-маршрут `/auth`.
- `src/shared/lib/matrix/client.ts` — динамический `baseUrl`, вход и регистрация, общая проверка session response.
- Новый модуль homeserver discovery/registration в `src/shared/lib/matrix/`.
- `src/shared/lib/matrix/session.ts` — server-aware session и миграция старых записей.
- `src/shared/lib/matrix/lifecycle.ts`, `api/spaces.ts` — устранение предположения об одном сервере.
- `src/shared/lib/matrix/index.ts` — публичный API новых операций.
- Тесты рядом с соответствующими модулями.
- `README.md`, `.env.example` — production server, регистрация и полный Matrix ID.
- `/srv/capsa/synapse/homeserver.yaml` на VPS — регистрация и SMTP, без коммита секрета.

## 10. Проверка и критерии приёмки

Автоматические тесты сначала воспроизводят новое поведение, затем реализация:

- разбор короткого логина и полного Matrix ID;
- успешный discovery и отказ при FAIL/PROMPT/invalid base URL;
- login и initClient используют выбранный сервер;
- старая сессия получает production defaults; новая сохраняет server fields;
- регистрация запускает UIA с email, не завершается до подтверждения;
- resend использует текущую регистрационную сессию;
- успешная регистрация сохраняет сессию и ведёт в чаты;
- занятый логин/email, rate limit, сеть и неподдерживаемый flow дают отдельные сообщения;
- unmount/начало заново останавливают polling и не оставляют фоновых обновлений state;
- `pnpm test`, `pnpm lint`, `pnpm build` проходят.

Ручная приёмка на production:

1. На тестовый email создаётся новый аккаунт `capsachat.org`.
2. До клика по ссылке аккаунт не получает сессию в Capsa.
3. Письмо приходит от домена Resend, ссылка подтверждает email, открытая вкладка сама завершает регистрацию.
4. Новый пользователь попадает в чаты; перезагрузка сохраняет вход.
5. Пользователь `matrix.org` входит полным Matrix ID; после перезагрузки клиент остаётся подключён к `matrix.org`.
6. Короткий логин пользователя Capsa продолжает работать.
7. Существующий production-аккаунт и E2EE recovery не ломаются.
8. В Git, browser console, client logs и shell history отсутствуют API key, пароли и access tokens.

## 11. Решения, оставленные исполнителю

- Точное визуальное расположение ссылок, текстов и состояний loading в рамках существующего дизайна.
- Интервал polling и cooldown resend, если они покрыты deterministic-тестами и не создают лишней нагрузки.
- Разбиение registration UI на небольшие компоненты без введения нового state manager.
- Служебные функции валидации Matrix error response, если они не меняют описанное поведение.

Нельзя без нового обсуждения заменять Synapse регистрацию собственной БД, убирать обязательный email, открывать регистрацию на других серверах или добавлять API key в браузерный bundle.
