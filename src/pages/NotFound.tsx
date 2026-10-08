import { Link, useLocation } from "react-router-dom";

const NotFound = () => {
  const location = useLocation();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <h1 className="text-6xl font-bold text-muted-foreground/40">404</h1>
        <p className="text-lg text-muted-foreground">
          No page found at <code className="text-sm bg-muted px-2 py-1 rounded">{location.pathname}</code>
        </p>
        <Link to="/" className="inline-block text-sm text-primary hover:text-primary/80 underline underline-offset-4">
          Go home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
