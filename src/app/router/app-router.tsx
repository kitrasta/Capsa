import { Route, Routes, Navigate } from 'react-router-dom'
import { lazy } from 'react'
import LoginPage from '../../pages/LoginPage.tsx'
import AuthLayout from '../ui/AuthLayout.tsx'
import MainLayout from '../ui/MainLayout.tsx'
import  AuthGuard  from './AuthGuard.tsx'

// Страницы защищённой зоны грузятся лениво: на /auth не нужен код чатов
// и настроек. Suspense-обёртка — в MainLayout вокруг <Outlet/>.
// LoginPage остаётся статическим — это стартовый экран.
const ChatsPage = lazy(() => import('../../pages/ChatsPage.tsx'))
const SpaceWorkspacePage = lazy(() => import('../../pages/SpaceWorkspacePage.tsx'))
const ContactsPage = lazy(() => import('../../pages/ContactsPage.tsx'))
const CallsPage = lazy(() => import('../../pages/CallsPage.tsx'))
const GeneralSettingsPage = lazy(() => import('../../pages/GeneralSettingsPage.tsx'))
const DevicesSettingsPage = lazy(() => import('../../pages/DevicesSettingsPage.tsx'))
const AppearanceSettingsPage = lazy(() => import('../../pages/AppearanceSettingsPage.tsx'))
const NotificationsSettingsPage = lazy(() => import('../../pages/NotificationsSettingsPage.tsx'))

const AppRouter = () => {
    return (
        <Routes>
            <Route element={<AuthLayout />}>
                <Route path="/auth" element={<LoginPage />} />

            </Route>
            <Route element={<AuthGuard />}>
                <Route element={<MainLayout />}>
                    <Route path="/chats" element={<ChatsPage />} />
                    <Route path="/chats/:roomId" element={<ChatsPage />} />
                    <Route path="/spaces/:spaceId" element={<SpaceWorkspacePage />} />
                    <Route path="/spaces/:spaceId/chats/:roomId" element={<SpaceWorkspacePage />} />
                    <Route path="/contacts" element={<ContactsPage />} />
                    <Route path="/calls" element={<CallsPage />} />
                    <Route path='/settings' element={<Navigate to="/settings/general" replace />} />
                    <Route path='/settings/general' element={<GeneralSettingsPage />} />
                    <Route path='/settings/devices' element={<DevicesSettingsPage />} />
                    <Route path='/settings/appearance' element={<AppearanceSettingsPage />} />
                    <Route path='/settings/notifications' element={<NotificationsSettingsPage />} />
                </Route>
            </Route>


            <Route path="*" element={<Navigate to="/auth" />} />
            <Route path="/" element={<Navigate to="/auth" />} />
        </Routes>
    )
}


export default AppRouter
