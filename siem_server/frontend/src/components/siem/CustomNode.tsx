import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Monitor, Server, Cloud, Smartphone, HelpCircle, Router } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface CustomNodeData {
    label: string;
    type: string;
    ip: string;
    mac: string;
}

// React Flow passes data inside the `data` prop
const CustomNode = ({ data, selected }: NodeProps<any>) => {
    // Determine Icon and Styles based on type
    // Default (Unknown/Device)
    let Icon = Monitor;
    let bgClass = "bg-card";
    let borderClass = "border-border";
    let iconColor = "text-foreground";

    if (data.type === 'gateway') {
        Icon = Router;
        bgClass = "bg-blue-950/20";
        borderClass = "border-blue-500/50";
        iconColor = "text-blue-500";
    } else if (data.type === 'external') {
        Icon = Cloud;
        bgClass = "bg-orange-950/20";
        borderClass = "border-orange-500/50";
        iconColor = "text-orange-500";
    } else if (data.type === 'device') {
        Icon = Monitor;
        bgClass = "bg-slate-950/40";
        borderClass = "border-slate-500/50";
    }

    // Highlight if selected
    if (selected) {
        borderClass = "border-primary ring-2 ring-primary/20 shadow-lg shadow-primary/10";
    }

    return (
        <>
            <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-muted-foreground/50 !border-2 !border-background" />

            <div className={cn(
                "px-4 py-3 rounded-xl shadow-sm border min-w-[160px]",
                "flex flex-col items-center gap-2 transition-all duration-300",
                "hover:shadow-md hover:border-primary/50 cursor-pointer backdrop-blur-sm",
                bgClass,
                borderClass
            )}>

                {/* Icon Container */}
                <div className={cn(
                    "p-2.5 rounded-full bg-background border shadow-sm transition-transform duration-300 group-hover:scale-110",
                    selected ? "border-primary/50" : "border-border"
                )}>
                    <Icon className={cn("w-5 h-5", iconColor)} />
                </div>

                {/* Info */}
                <div className="text-center w-full">
                    <div className="font-semibold text-sm text-foreground truncate max-w-[140px]" title={data.label}>
                        {data.label}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono mt-0.5">
                        {data.ip}
                    </div>
                </div>

                {/* MAC Badge (if present) */}
                {data.mac && data.mac !== "Unknown (External)" && (
                    <Badge variant="secondary" className="text-[10px] h-5 font-mono opacity-70">
                        {data.mac.slice(0, 8)}...
                    </Badge>
                )}
            </div>

            <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-muted-foreground/50 !border-2 !border-background" />
        </>
    );
};

export default memo(CustomNode);
