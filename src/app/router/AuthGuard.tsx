import {Navigate, Outlet} from "react-router-dom";
import {getSession} from "../../shared/lib/matrix/session";

export const AuthGuard = () => {
    const session = getSession();

    if (!session) {
        return <Navigate to="auth" replace />;
    }

    return <Outlet />;
}