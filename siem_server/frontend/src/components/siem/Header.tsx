import { Shield, Activity, Download, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

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

        {/* Right section: active nodes button, export, and settings */}
        <div className="flex items-center gap-4">
           {/* Active Nodes Button */}
           <div className="relative">
             <Button
               variant="outline"
               size="sm"
               onClick={() => setShowNodeMenu(!showNodeMenu)}
               className="flex items-center gap-2"
             >
               <Activity className="h-4 w-4" />
               Active Nodes
               <Badge variant="secondary" className="ml-1">
                 {nodes.filter(n => n.online).length}
               </Badge>
             </Button>

             {showNodeMenu && (
               <Card className="absolute top-full right-0 mt-2 w-80 shadow-xl border-border bg-card z-50">
                 <CardHeader className="pb-3">
                   <CardTitle className="text-sm">Node Selection</CardTitle>
                 </CardHeader>
                 <CardContent className="space-y-3">
                   <Select
                     value={selectedNode}
                     onValueChange={(value) => {
                       onNodeChange(value);
                       setShowNodeMenu(false); // Close menu after selection
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
                 </CardContent>
               </Card>
             )}
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
