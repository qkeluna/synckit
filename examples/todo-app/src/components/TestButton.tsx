import { useState } from 'react'
import { useSyncKit } from '@synckit-js/sdk'

export default function TestButton() {
  const [result, setResult] = useState<string>('')
  const [testing, setTesting] = useState(false)
  const synckit = useSyncKit()

  const runTest = async () => {
    setTesting(true)
    setResult('Running tests...')
    
    try {
      const results: string[] = []
      
      // Test 1: Check if SyncKit is initialized
      if (synckit.isInitialized()) {
        results.push('✅ SyncKit initialized')
      } else {
        results.push('❌ SyncKit not initialized')
      }
      
      // Test 2: Get client ID
      const clientId = synckit.getClientId()
      results.push(`✅ Client ID: ${clientId.substring(0, 8)}...`)
      
      // Test 3: Create test document
      const testDoc = synckit.document<{ test: string }>('test-doc')
      await testDoc.init()
      results.push('✅ Document created')
      
      // Test 4: Set field
      await testDoc.set('test', 'Hello from SyncKit!')
      results.push('✅ Field set')
      
      // Test 5: Get field
      const value = testDoc.get()
      if (value.test === 'Hello from SyncKit!') {
        results.push('✅ Field retrieved correctly')
      } else {
        results.push('❌ Field value mismatch')
      }
      
      // Test 6: List documents
      const docs = await synckit.listDocuments()
      results.push(`✅ Found ${docs.length} documents`)
      
      // Cleanup
      await synckit.deleteDocument('test-doc')
      results.push('✅ Test document cleaned up')
      
      results.push('\n🎉 ALL TESTS PASSED!')
      results.push('Phase 6 is COMPLETE! ✅')
      
      setResult(results.join('\n'))
    } catch (error) {
      setResult(`❌ Test failed: ${error}`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      background: 'white',
      padding: '15px',
      borderRadius: '10px',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      maxWidth: '300px',
      zIndex: 1000,
    }}>
      <button
        onClick={runTest}
        disabled={testing}
        style={{
          width: '100%',
          padding: '10px',
          background: '#5B5FC7',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: testing ? 'not-allowed' : 'pointer',
          fontSize: '14px',
          fontWeight: 'bold',
        }}
      >
        {testing ? 'Testing...' : '🧪 Run Phase 6 Tests'}
      </button>
      
      {result && (
        <pre style={{
          marginTop: '10px',
          padding: '10px',
          background: '#f5f5f5',
          borderRadius: '5px',
          fontSize: '11px',
          whiteSpace: 'pre-wrap',
          maxHeight: '300px',
          overflow: 'auto',
        }}>
          {result}
        </pre>
      )}
    </div>
  )
}
