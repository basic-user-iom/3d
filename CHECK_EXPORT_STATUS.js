// Quick Status Check - Paste this in browser console
// This will show if Revit has uploaded any models

(async function() {
    console.log('🔍 Checking Revit Export Status...\n');
    
    // Check server health
    try {
        const health = await fetch('http://localhost:3002/api/revit/health').then(r => r.json());
        console.log('✅ Server Health:', health);
    } catch (e) {
        console.error('❌ Server not available:', e.message);
    }
    
    // Check active sessions
    try {
        const sessions = await fetch('http://localhost:3002/api/revit/sessions').then(r => r.json());
        console.log('\n📋 Active Sessions:', sessions);
        
        if (sessions.sessions && sessions.sessions.length > 0) {
            console.log('✅ Models have been uploaded!');
            sessions.sessions.forEach(s => {
                console.log(`  - ${s.fileName} (${s.sessionId})`);
            });
        } else {
            console.log('❌ NO MODELS UPLOADED YET');
            console.log('   This means Revit export is not reaching the server.');
            console.log('   Check:');
            console.log('   1. Did you click "Direct Link" in Revit?');
            console.log('   2. Did you see any errors in Revit?');
            console.log('   3. Check server window for "POST /api/revit/upload" messages');
        }
    } catch (e) {
        console.error('❌ Error checking sessions:', e.message);
    }
    
    // Check WebSocket connection
    if (window.revitSyncManager) {
        console.log('\n🔌 WebSocket Status:');
        console.log('  Connected:', window.revitSyncManager.isConnected);
        console.log('  Session ID:', window.revitSyncManager.sessionId || '(none)');
    } else {
        console.log('\n⚠️ RevitSyncManager not found');
    }
    
    // Check scene for Revit models
    if (window.viewer && window.viewer.scene) {
        console.log('\n👁️ Scene Status:');
        console.log('  Total children:', window.viewer.scene.children.length);
        
        let revitModelCount = 0;
        window.viewer.scene.traverse(obj => {
            if (obj.userData?.isRevitModel) {
                revitModelCount++;
            }
        });
        
        if (revitModelCount > 0) {
            console.log('  ✅ Found', revitModelCount, 'Revit model(s) in scene');
        } else {
            console.log('  ❌ NO REVIT MODELS IN SCENE');
            console.log('     This confirms: export is not working');
        }
    }
    
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('SUMMARY:');
    console.log('═══════════════════════════════════════════════════════');
    console.log('If "NO MODELS UPLOADED" → Revit export is failing');
    console.log('If "NO REVIT MODELS IN SCENE" → Model not loaded');
    console.log('Next step: Check Revit for export errors');
    console.log('═══════════════════════════════════════════════════════');
})();
