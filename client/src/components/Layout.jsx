import { Link } from 'react-router-dom'
import Logo from './Logo'

export default function Layout({ children }) {
  return (
    <div className="flex min-h-svh flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <header className="flex items-center justify-between px-4 py-4 sm:px-8 sm:py-6">
        <Link to="/" className="outline-none">
          <Logo />
        </Link>
        <span className="hidden text-xs font-medium text-muted sm:block">
          Peer-to-peer &middot; No account needed
        </span>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
      <footer className="px-4 pb-6 pt-2 text-center text-xs text-faint sm:px-8">
        Streams travel directly between devices. Nothing is recorded or stored.
      </footer>
    </div>
  )
}
