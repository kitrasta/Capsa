import {Navigate, Outlet} from "react-router-dom";
import {getSession} from "../../shared/lib/matrix/session";

 const AuthGuard = () => {
    const session = getSession();

    if (!session) {
        return <Navigate to="auth" replace />;
    }

    return <Outlet />;
}

export default AuthGuard;