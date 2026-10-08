import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { SettingsProvider } from '@/hooks/useSettings';
import { ProxyProvider } from '@/hooks/useProxySession';
import { WindowsProvider } from '@/hooks/useWindows';
import { BootScreen } from '@/components/os/BootScreen';
import { LockScreen } from '@/components/os/LockScreen';
import { Desktop } from '@/components/os/Desktop';

const BOOT_KEY = 'ados:booted';

function OsRoot() {
  const { user, loading, signOut } = useAuth();
  const [booted] = useState(() => {
    try {
      return sessionStorage.getItem(BOOT_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [bootDone, setBootDone] = useState(booted);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (bootDone) {
      try {
        sessionStorage.setItem(BOOT_KEY, '1');
      } catch {
        // private mode — boot plays again next visit, no harm
      }
    }
  }, [bootDone]);

  if (!bootDone || loading) {
    return <BootScreen onDone={() => setBootDone(true)} />;
  }

  if (!user || locked) {
    return (
      <SettingsProvider key={`pre-${user?.userUuid ?? 'anon'}`}>
        <LockScreen onUnlock={() => setLocked(false)} />
      </SettingsProvider>
    );
  }

  return (
    <SettingsProvider key={user.userUuid}>
      <ProxyProvider>
        <WindowsProvider>
          <Desktop onLock={() => setLocked(true)} onSignOut={() => void signOut()} />
        </WindowsProvider>
      </ProxyProvider>
    </SettingsProvider>
  );
}

export default function Index() {
  return (
    <AuthProvider>
      <OsRoot />
    </AuthProvider>
  );
}
