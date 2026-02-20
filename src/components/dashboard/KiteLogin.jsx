import { useState, useEffect } from 'react';
import { LogIn, LogOut, User, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import kiteAPI from '../../lib/api';

const KiteLogin = ({ onAuthChange }) => {
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [backendOnline, setBackendOnline] = useState(false);

    useEffect(() => {
        checkConnection();

        // Check for auth callback in URL
        const params = new URLSearchParams(window.location.search);
        if (params.get('auth') === 'success') {
            // Clean URL
            window.history.replaceState({}, '', window.location.pathname);
            checkProfile();
        } else if (params.get('auth') === 'failed') {
            window.history.replaceState({}, '', window.location.pathname);
            setLoading(false);
        }
    }, []);

    const checkConnection = async () => {
        const online = await kiteAPI.checkHealth();
        setBackendOnline(online);
        if (online) {
            await checkProfile();
        } else {
            setLoading(false);
        }
    };

    const checkProfile = async () => {
        try {
            const data = await kiteAPI.getProfile();
            setProfile(data);
            onAuthChange?.(data);
        } catch {
            setProfile(null);
            onAuthChange?.(null);
        }
        setLoading(false);
    };

    const handleLogin = async () => {
        try {
            const url = await kiteAPI.getLoginUrl();
            window.location.href = url;
        } catch (err) {
            console.error('Login failed:', err);
        }
    };

    const handleLogout = async () => {
        try {
            await kiteAPI.logout();
            setProfile(null);
            onAuthChange?.(null);
        } catch (err) {
            console.error('Logout failed:', err);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="size-4 animate-spin" />
                <span>Connecting...</span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-3">
            {/* Backend Status */}
            <div className={cn(
                "flex items-center gap-1.5 text-xs px-2 py-1 rounded-full",
                backendOnline ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
            )}>
                {backendOnline ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
                {backendOnline ? "API" : "Offline"}
            </div>

            {profile ? (
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 bg-primary/10 text-primary px-3 py-1.5 rounded-lg text-sm">
                        <User className="size-4" />
                        <span className="font-medium">{profile.user_id}</span>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="p-2 hover:bg-red-500/10 text-muted-foreground hover:text-red-500 rounded-lg transition-colors"
                        title="Logout"
                    >
                        <LogOut className="size-4" />
                    </button>
                </div>
            ) : (
                <button
                    onClick={handleLogin}
                    disabled={!backendOnline}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                        backendOnline
                            ? "bg-blue-600 text-white hover:bg-blue-700"
                            : "bg-muted text-muted-foreground cursor-not-allowed"
                    )}
                >
                    <LogIn className="size-4" />
                    Connect Kite
                </button>
            )}
        </div>
    );
};

export default KiteLogin;
