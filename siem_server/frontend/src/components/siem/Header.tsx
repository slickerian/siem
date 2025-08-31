import { Shield, Activity, Download, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  onExport: () => void;
  isConnected: boolean;
  totalEvents: number;
}

export function Header({ onExport, isConnected, totalEvents }: HeaderProps) {
  return (
    <header className="siem-header px-6 py-4 sticky top-0 z-50 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        {/* Left section: logo and connection status */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">SIEM Dashboard</h1>
              <p className="text-sm text-muted-foreground">Security Information & Event Management</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 ml-8">
            <div className={`status-indicator ${isConnected ? 'bg-primary' : 'bg-destructive'} animate-pulse-slow`} />
            <span className="text-sm text-muted-foreground">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>

        {/* Right section: stats and buttons */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">{totalEvents.toLocaleString()} events</span>
          </div>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={onExport}
            className="border-border hover:bg-accent"
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>

          <Button 
            variant="ghost" 
            size="sm"
            className="hover:bg-accent"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
