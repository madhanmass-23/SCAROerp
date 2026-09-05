import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { AlertCircle, Home, ArrowLeft } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="max-w-md w-full text-center border-border shadow-lg">
        <CardContent className="p-8 space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <AlertCircle className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-4xl font-extrabold text-primary tracking-tight">404</h1>
            <h2 className="text-xl font-bold text-content">Page Not Found</h2>
            <p className="text-sm text-content-muted">
              The page or resource you requested could not be found. It may have been moved or does not exist.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              variant="outline"
              onClick={() => window.history.back()}
              className="flex items-center justify-center gap-2 text-xs"
            >
              <ArrowLeft className="w-4 h-4" /> Go Back
            </Button>
            <Link to="/app/dashboard">
              <Button
                variant="primary"
                className="w-full sm:w-auto flex items-center justify-center gap-2 text-xs"
              >
                <Home className="w-4 h-4" /> Return to Dashboard
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
