import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ShieldCheck,
  Building2,
  Gauge,
  Activity,
  Terminal as TerminalIcon,
  Settings as SettingsIcon,
  Info,
  MessageCircle,
  Music2,
  Gamepad2,
  Cloud,
  Globe,
  Sparkles,
  FolderOpen,
  Camera,
} from 'lucide-react';
import ProxyManagerApp from './apps/ProxyManagerApp';
import SpeedTestApp from './apps/SpeedTestApp';
import NetworkMonitorApp from './apps/NetworkMonitorApp';
import TerminalApp from './apps/TerminalApp';
import SettingsApp from './apps/SettingsApp';
import AboutApp from './apps/AboutApp';
import DuckChatApp from './apps/DuckChatApp';
import PlaylistApp from './apps/PlaylistApp';
import BrowserApp from './apps/BrowserApp';
import DuckcadeApp from './apps/DuckcadeApp';
import CloudPlayApp from './apps/CloudPlayApp';
import DuckyAiApp from './apps/DuckyAiApp';
import StaffConsoleApp from './apps/StaffConsoleApp';
import FilesApp from './apps/FilesApp';
import CaptureApp from './apps/CaptureApp';

export interface OsApp {
  id: string;
  name: string;
  tagline: string;
  icon: LucideIcon;
  iconBg: string;
  size: { w: number; h: number };
  Component: ComponentType<{ windowId: string }>;
  /** Hidden apps open only via the terminal — never on the desktop or start menu. */
  hidden?: boolean;
}

export const OS_APPS: OsApp[] = [
  {
    id: 'proxy',
    name: 'Proxy Manager',
    tagline: 'Scramjet tunnels and pond servers',
    icon: ShieldCheck,
    iconBg: 'bg-gradient-to-br from-amber-400 to-orange-500',
    size: { w: 880, h: 600 },
    Component: ProxyManagerApp,
  },
  {
    id: 'browser',
    name: 'Duck Browser',
    tagline: 'DuckDuckGo search, YouTube and the real web',
    icon: Globe,
    iconBg: 'bg-gradient-to-br from-[#e2643f] to-[#b8432a]',
    size: { w: 1000, h: 700 },
    Component: BrowserApp,
  },
  {
    id: 'duckyai',
    name: 'Ducky AI',
    tagline: 'The OS’s own assistant — ask it anything',
    icon: Sparkles,
    iconBg: 'bg-gradient-to-br from-amber-300 to-orange-500',
    size: { w: 900, h: 640 },
    Component: DuckyAiApp,
  },
  {
    id: 'chat',
    name: 'DuckChat',
    tagline: 'Public pond, group servers, DMs and calls',
    icon: MessageCircle,
    iconBg: 'bg-gradient-to-br from-violet-500 to-indigo-500',
    size: { w: 960, h: 640 },
    Component: DuckChatApp,
  },
  {
    id: 'beats',
    name: 'Duck Beats',
    tagline: 'Your playlist — YouTube & Spotify in the OS',
    icon: Music2,
    iconBg: 'bg-gradient-to-br from-fuchsia-500 to-purple-600',
    size: { w: 760, h: 620 },
    Component: PlaylistApp,
  },
  {
    id: 'arcade',
    name: 'Duckcade',
    tagline: '12 mini-games, DuckCoins and live leaderboard',
    icon: Gamepad2,
    iconBg: 'bg-gradient-to-br from-emerald-500 to-teal-600',
    size: { w: 1040, h: 700 },
    Component: DuckcadeApp,
  },
  {
    id: 'cloudplay',
    name: 'CloudPlay',
    tagline: 'Stream Roblox and big games inside the OS',
    icon: Cloud,
    iconBg: 'bg-gradient-to-br from-fuchsia-500 to-purple-600',
    size: { w: 960, h: 660 },
    Component: CloudPlayApp,
  },
  {
    id: 'speed',
    name: 'Speed Test',
    tagline: 'Pond bandwidth checks',
    icon: Gauge,
    iconBg: 'bg-gradient-to-br from-sky-400 to-blue-600',
    size: { w: 640, h: 620 },
    Component: SpeedTestApp,
  },
  {
    id: 'monitor',
    name: 'Network Monitor',
    tagline: 'Sessions and speed history',
    icon: Activity,
    iconBg: 'bg-gradient-to-br from-rose-400 to-pink-600',
    size: { w: 900, h: 610 },
    Component: NetworkMonitorApp,
  },
  {
    id: 'terminal',
    name: 'Duck Terminal',
    tagline: 'ducksh command line',
    icon: TerminalIcon,
    iconBg: 'bg-gradient-to-br from-slate-500 to-slate-700',
    size: { w: 700, h: 470 },
    Component: TerminalApp,
  },
  {
    id: 'settings',
    name: 'Settings',
    tagline: 'Accent, wallpaper and account',
    icon: SettingsIcon,
    iconBg: 'bg-gradient-to-br from-gray-400 to-gray-600',
    size: { w: 740, h: 580 },
    Component: SettingsApp,
  },
  {
    id: 'about',
    name: 'About AcceleDuck',
    tagline: 'What this OS is',
    icon: Info,
    iconBg: 'bg-gradient-to-br from-yellow-400 to-amber-500',
    size: { w: 620, h: 560 },
    Component: AboutApp,
  },
  {
    id: 'staff',
    name: 'AcceleDuck Inc',
    tagline: 'Staff console (terminal: /AcceleduckInc)',
    icon: Building2,
    iconBg: 'bg-gradient-to-br from-zinc-500 to-zinc-800',
    size: { w: 480, h: 640 },
    Component: StaffConsoleApp,
    hidden: true,
  },
  {
    id: 'files',
    name: 'Files',
    tagline: 'Your pond storage — run HTML games here',
    icon: FolderOpen,
    iconBg: 'bg-gradient-to-br from-amber-300 to-orange-500',
    size: { w: 940, h: 640 },
    Component: FilesApp,
  },
  {
    id: 'capture',
    name: 'Duck Cam',
    tagline: 'Photos & screen recording — saved to Files',
    icon: Camera,
    iconBg: 'bg-gradient-to-br from-rose-400 to-pink-600',
    size: { w: 800, h: 600 },
    Component: CaptureApp,
  },
];

export const getApp = (id: string): OsApp | undefined => OS_APPS.find((a) => a.id === id);
