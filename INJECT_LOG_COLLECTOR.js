// Log Collector Bookmarklet - Run this in the browser console on the 3D viewer page
// Copy this entire script and paste it into the browser console (F12) on http://localhost:3000

(function() {
    console.log('🔍 Log Collector Injected!');
    
    const report = {
        timestamp: new Date().toISOString(),
        browserLogs: [],
        serverStatus: {},
        viewerState: {},
        errors: []
    };
    
    // Capture console logs
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    
    console.log = function(...args) {
        report.browserLogs.push(`[LOG] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`);
        originalLog.apply(console, args);
    };
    
    console.error = function(...args) {
        report.browserLogs.push(`[ERROR] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`);
        originalError.apply(console, args);
    };
    
    console.warn = function(...args) {
        report.browserLogs.push(`[WARN] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`);
        originalWarn.apply(console, args);
    };
    
    // Collect server status
    async function collectServerStatus() {
        try {
            const healthResponse = await fetch('http://localhost:3002/api/revit/health');
            report.serverStatus.health = await healthResponse.json();
            
            const sessionsResponse = await fetch('http://localhost:3002/api/revit/sessions');
            report.serverStatus.sessions = await sessionsResponse.json();
        } catch (error) {
            report.serverStatus.error = error.message;
        }
    }
    
    // Collect viewer state
    function collectViewerState() {
        if (window.viewer) {
            report.viewerState.exists = true;
            report.viewerState.sceneChildren = window.viewer.scene?.children.length || 0;
            report.viewerState.revitModels = [];
            
            if (window.viewer.scene) {
                window.viewer.scene.traverse((obj) => {
                    if (obj.userData?.isRevitModel) {
                        report.viewerState.revitModels.push({
                            name: obj.name || obj.type,
                            visible: obj.visible,
                            children: obj.children.length
                        });
                    }
                });
            }
        } else {
            report.viewerState.exists = false;
        }
        
        if (window.revitSyncManager) {
            report.viewerState.revitSyncConnected = window.revitSyncManager.isConnected;
            report.viewerState.revitSyncSessionId = window.revitSyncManager.sessionId;
        }
    }
    
    // Generate report
    async function generateReport() {
        await collectServerStatus();
        collectViewerState();
        
        const fullReport = `=== REVIT CONNECTION - COMPLETE LOG REPORT ===
Generated: ${new Date().toLocaleString()}
URL: ${window.location.href}

═══════════════════════════════════════════════════════════════
1. BROWSER CONSOLE LOGS (Last 100 entries)
═══════════════════════════════════════════════════════════════

${report.browserLogs.slice(-100).join('\n')}

═══════════════════════════════════════════════════════════════
2. SERVER STATUS
═══════════════════════════════════════════════════════════════

${JSON.stringify(report.serverStatus, null, 2)}

═══════════════════════════════════════════════════════════════
3. VIEWER STATE
═══════════════════════════════════════════════════════════════

${JSON.stringify(report.viewerState, null, 2)}

═══════════════════════════════════════════════════════════════
4. SCENE CHILDREN DETAILS
═══════════════════════════════════════════════════════════════

${window.viewer?.scene ? window.viewer.scene.children.map((child, i) => 
    `[${i}] ${child.name || child.type || 'Unknown'} | visible: ${child.visible} | isRevit: ${child.userData?.isRevitModel || false} | children: ${child.children.length}`
).join('\n') : 'Viewer scene not available'}

═══════════════════════════════════════════════════════════════
END OF REPORT
═══════════════════════════════════════════════════════════════`;

        console.log('\n' + '='.repeat(60));
        console.log('COMPLETE LOG REPORT:');
        console.log('='.repeat(60));
        console.log(fullReport);
        console.log('='.repeat(60));
        
        // Copy to clipboard
        if (navigator.clipboard) {
            navigator.clipboard.writeText(fullReport).then(() => {
                console.log('✅ Report copied to clipboard!');
                alert('✅ Complete log report copied to clipboard!\n\nPaste it here for analysis.');
            });
        } else {
            console.log('⚠️ Clipboard API not available. Copy the report manually.');
        }
        
        return fullReport;
    }
    
    // Expose function globally with multiple names for convenience
    window.collectRevitLogs = generateReport;
    window.INJECT_LOG_COLLECTOR = generateReport; // Alias for easy access
    
    console.log('✅ Log collector ready!');
    console.log('Run: collectRevitLogs() or INJECT_LOG_COLLECTOR()');
    console.log('Auto-collecting in 1 second...');
    
    // Auto-collect after a short delay
    setTimeout(async () => {
        console.log('🔍 Auto-collecting logs...');
        await generateReport();
    }, 1000);
})();
