import { Shield, Activity, Download, Settings, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "next-themes";

interface HeaderProps {
  onExport: () => void;
  isConnected: boolean;
  totalEvents: number;
  nodes: { node_id: string; online: boolean }[];
  selectedNode: string;
  onNodeChange: (nodeId: string) => void;
  showNodeMenu: boolean;
  setShowNodeMenu: (show: boolean) => void;
}

export function Header({ onExport, isConnected, totalEvents, nodes, selectedNode, onNodeChange, showNodeMenu, setShowNodeMenu }: HeaderProps) {
  const { theme, setTheme } = useTheme();
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

        {/* Right section: active node display, export, and settings */}
        <div className="flex items-center gap-4">
           {/* Active Node Display */}
           <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-muted/50">
             <div className={`w-2 h-2 rounded-full ${selectedNode && nodes.find(n => n.node_id === selectedNode)?.online ? 'bg-primary animate-pulse-slow' : 'bg-destructive'}`} />
             <span className="text-sm font-medium">{selectedNode || 'No node selected'}</span>
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

           <div className="relative">
             <Button
               variant="ghost"
               size="sm"
               onClick={() => setShowNodeMenu(!showNodeMenu)}
               className="hover:bg-accent"
             >
               <Settings className="h-4 w-4" />
             </Button>

             {showNodeMenu && (
             <Card className="absolute top-full right-0 mt-2 w-80 shadow-xl border-border bg-card z-50">
               <CardHeader className="pb-3">
                 <CardTitle className="text-sm">Settings</CardTitle>
               </CardHeader>
               <CardContent className="space-y-4">
                 {/* Theme Toggle */}
                 <div className="space-y-2">
                   <label className="text-sm font-medium">Theme</label>
                   <div className="flex items-center gap-2">
                     <Button
                       variant={theme === 'light' ? 'default' : 'outline'}
                       size="sm"
                       onClick={() => setTheme('light')}
                       className="flex items-center gap-2"
                     >
                       <Sun className="h-4 w-4" />
                       Light
                     </Button>
                     <Button
                       variant={theme === 'dark' ? 'default' : 'outline'}
                       size="sm"
                       onClick={() => setTheme('dark')}
                       className="flex items-center gap-2"
                     >
                       <Moon className="h-4 w-4" />
                       Dark
                     </Button>
                     <Button
                       variant={theme === 'system' ? 'default' : 'outline'}
                       size="sm"
                       onClick={() => setTheme('system')}
                       className="flex items-center gap-2"
                     >
                       <Settings className="h-4 w-4" />
                       System
                     </Button>
                   </div>
                 </div>

                 {/* Divider */}
                 <div className="border-t border-border" />

                 {/* Node Selection */}
                 <div className="space-y-2">
                   <label className="text-sm font-medium">Node Selection</label>
                   <Select
                     value={selectedNode}
                     onValueChange={(value) => {
                       onNodeChange(value);
                       // Don't close menu after selection for nodes
                     }}
                   >
                     <SelectTrigger className="bg-input border-border">
                       <SelectValue placeholder="Select node..." />
                     </SelectTrigger>
                     <SelectContent className="bg-popover border-border">
                       {nodes.map((node) => (
                         <SelectItem key={node.node_id} value={node.node_id}>
                           <div className="flex items-center gap-2">
                             <div className={`w-2 h-2 rounded-full ${node.online ? 'bg-primary' : 'bg-muted-foreground'}`} />
                             {node.node_id}
                             <Badge variant={node.online ? "default" : "secondary"} className="ml-auto text-xs">
                               {node.online ? "Online" : "Offline"}
                             </Badge>
                           </div>
                         </SelectItem>
                       ))}
                     </SelectContent>
                   </Select>

                   <div className="text-xs text-muted-foreground space-y-1">
                     <div>Total nodes: {nodes.length}</div>
                     <div>Online: {nodes.filter(n => n.online).length}</div>
                     <div>Offline: {nodes.filter(n => !n.online).length}</div>
                   </div>
                 </div>
               </CardContent>
             </Card>
           )}

          </div>
        </div>
      </div>
    </header>
  );
}
