import React, { useState, useEffect } from "react";
import { siemApi, NodeStatus } from "../services/siemApi";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "../components/ui/alert-dialog";

interface NodeSettings {
  node_id: string;
  name: string;
  enable_log_collection: boolean;
  log_send_interval: number;
}

const Settings = () => {
  const [nodes, setNodes] = useState<NodeStatus[]>([]);
  const [selectedNode, setSelectedNode] = useState<string>("");
  const [settings, setSettings] = useState<NodeSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [severities, setSeverities] = useState({ critical: "", warning: "", info: "" });

  useEffect(() => {
    loadNodes();
    loadSeverities();
  }, []);

  useEffect(() => {
    if (selectedNode) {
      loadNodeSettings();
    }
  }, [selectedNode]);

  const loadNodes = async () => {
    try {
      const nodeList = await siemApi.getNodes();
      setNodes(nodeList);
    } catch (error) {
      console.error("Failed to load nodes:", error);
    }
  };

  const loadSeverities = async () => {
    try {
      const sev = await siemApi.getLogSeverities();
      setSeverities({
        critical: sev.critical || "",
        warning: sev.warning || "",
        info: sev.info || "",
      });
    } catch (error) {
      console.error("Failed to load severities:", error);
    }
  };

  const loadNodeSettings = async () => {
    if (!selectedNode) return;
    setLoading(true);
    try {
      const nodeSettings = await siemApi.getNodeSettings(selectedNode);
      setSettings(nodeSettings);
    } catch (error) {
      console.error("Failed to load node settings:", error);
      // Fallback to defaults
      setSettings({
        node_id: selectedNode,
        name: selectedNode,
        enable_log_collection: true,
        log_send_interval: 30,
      });
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    if (!settings) return;
    try {
      await siemApi.updateNodeSettings(selectedNode, settings);
      alert("Settings saved successfully!");
    } catch (error) {
      console.error("Failed to save settings:", error);
      alert("Failed to save settings");
    }
  };

  const deleteNode = async () => {
    if (!selectedNode) return;
    try {
      await siemApi.deleteNode(selectedNode);
      alert("Node deleted successfully!");
      setSelectedNode("");
      setSettings(null);
      loadNodes(); // Reload nodes list
    } catch (error) {
      console.error("Failed to delete node:", error);
      alert("Failed to delete node");
    }
    setDeleteDialogOpen(false);
    setConfirmText("");
  };

  const saveSeverities = async () => {
    try {
      await siemApi.updateLogSeverities(severities);
      alert("Log severities saved successfully!");
    } catch (error) {
      console.error("Failed to save severities:", error);
      alert("Failed to save severities");
    }
  };

  const selectedNodeData = nodes.find(n => n.node_id === selectedNode);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground">
          Configure your SIEM system preferences here.
        </p>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Node Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="node-select">Select Node</Label>
              <Select value={selectedNode} onValueChange={setSelectedNode}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a node to configure" />
                </SelectTrigger>
                <SelectContent>
                  {nodes.map((node) => (
                    <SelectItem key={node.node_id} value={node.node_id}>
                      {node.node_id} <Badge variant={node.online ? "default" : "secondary"}>{node.online ? "Online" : "Offline"}</Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedNode && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="node-name">Node Name</Label>
                  <Input
                    id="node-name"
                    value={settings?.name || ""}
                    onChange={(e) => setSettings(prev => prev ? {...prev, name: e.target.value} : null)}
                    placeholder="Enter node name"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Label htmlFor="node-status">Node Status:</Label>
                  <Badge variant={selectedNodeData?.online ? "default" : "secondary"}>
                    {selectedNodeData?.online ? "Online" : "Offline"}
                  </Badge>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="enable-log-collection"
                    checked={settings?.enable_log_collection || false}
                    onCheckedChange={(checked) => setSettings(prev => prev ? {...prev, enable_log_collection: checked} : null)}
                  />
                  <Label htmlFor="enable-log-collection">Enable Log Collection</Label>
                </div>

                <div>
                  <Label htmlFor="log-interval">Log Send Interval (seconds)</Label>
                  <Input
                    id="log-interval"
                    type="number"
                    min="1"
                    value={settings?.log_send_interval || 30}
                    onChange={(e) => setSettings(prev => prev ? {...prev, log_send_interval: parseInt(e.target.value) || 30} : null)}
                  />
                </div>

                <div className="flex space-x-2">
                  <Button onClick={saveSettings} disabled={loading}>
                    {loading ? "Saving..." : "Save Settings"}
                  </Button>
                  <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive">Delete Node</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This action will permanently delete node "{selectedNode}" and all its logs. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <div className="py-4">
                        <Label htmlFor="confirm-delete">Type the node name to confirm:</Label>
                        <Input
                          id="confirm-delete"
                          value={confirmText}
                          onChange={(e) => setConfirmText(e.target.value)}
                          placeholder={selectedNode}
                        />
                      </div>
                      <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setConfirmText("")}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={deleteNode} disabled={confirmText !== selectedNode}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="bg-card p-6 rounded-lg border">
          <h2 className="text-lg font-semibold mb-4">General Settings</h2>
          <p className="text-muted-foreground">
            General configuration options will be added here.
          </p>
        </div>

        <div className="bg-card p-6 rounded-lg border">
          <h2 className="text-lg font-semibold mb-4">Notification Settings</h2>
          <p className="text-muted-foreground">
            Configure alerts and notifications.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Security Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="critical-events">Critical Event Types</Label>
              <Input
                id="critical-events"
                value={severities.critical}
                onChange={(e) => setSeverities(prev => ({ ...prev, critical: e.target.value }))}
                placeholder="ERROR,CRITICAL,FAIL,ACTION_FAILED"
              />
              <p className="text-sm text-muted-foreground">Comma-separated list of event types that should be treated as critical (red alerts)</p>
            </div>

            <div>
              <Label htmlFor="warning-events">Warning Event Types</Label>
              <Input
                id="warning-events"
                value={severities.warning}
                onChange={(e) => setSeverities(prev => ({ ...prev, warning: e.target.value }))}
                placeholder="WARN,WARNING"
              />
              <p className="text-sm text-muted-foreground">Comma-separated list of event types that should be treated as warnings (yellow)</p>
            </div>

            <div>
              <Label htmlFor="info-events">Info Event Types</Label>
              <Input
                id="info-events"
                value={severities.info}
                onChange={(e) => setSeverities(prev => ({ ...prev, info: e.target.value }))}
                placeholder="INFO,AUTH,SUCCESS"
              />
              <p className="text-sm text-muted-foreground">Comma-separated list of event types that should be treated as info (blue)</p>
            </div>

            <Button onClick={saveSeverities}>
              Save Log Severities
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Settings;