import { Route, Routes, Navigate } from 'react-router-dom'
import LoginPage from '../../pages/LoginPage.tsx'
import AuthLayout from '../ui/AuthLayout.tsx'
import MainLayout from '../ui/MainLayout.tsx'
import ChatsPage from '../../pages/ChatsPage.tsx'
import ContactsPage from '../../pages/ContactsPage.tsx'
import CallsPage from '../../pages/CallsPage.tsx'
import GeneralSettingsPage from '../../pages/GeneralSettingsPage.tsx'
import SettingsStubPage from '../../pages/SettingsStubPage.tsx'
import  AuthGuard  from './AuthGuard.tsx'

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
                    <Route path="/contacts" element={<ContactsPage />} />
                    <Route path="/calls" element={<CallsPage />} />
                    <Route path='/settings' element={<Navigate to="/settings/general" replace />} />
                    <Route path='/settings/general' element={<GeneralSettingsPage />} />
                    <Route path='/settings/devices' element={<SettingsStubPage title="Устройства" />} />
                    <Route path='/settings/appearance' element={<SettingsStubPage title="Оформление" />} />
                    <Route path='/settings/notifications' element={<SettingsStubPage title="Уведомления" />} />
                </Route>
            </Route>


            <Route path="*" element={<Navigate to="/auth" />} />
            <Route path="/" element={<Navigate to="/auth" />} />
        </Routes>
    )
}


export default AppRouter
