import React, { useState, useEffect } from "react";
import { siemApi, NodeStatus } from "../services/siemApi";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

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

  useEffect(() => {
    loadNodes();
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

                <Button onClick={saveSettings} disabled={loading}>
                  {loading ? "Saving..." : "Save Settings"}
                </Button>
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

        <div className="bg-card p-6 rounded-lg border">
          <h2 className="text-lg font-semibold mb-4">Security Settings</h2>
          <p className="text-muted-foreground">
            Manage security and access controls.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Settings;