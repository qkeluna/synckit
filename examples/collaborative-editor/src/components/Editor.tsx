import { useEffect, useRef } from 'react'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { basicSetup } from 'codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { markdown } from '@codemirror/lang-markdown'
import { useSyncDocument } from '@synckit/sdk/react'

interface EditorProps {
  documentId: string
  language: 'markdown' | 'javascript' | 'typescript' | 'plaintext'
}

export default function Editor({ documentId, language }: EditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  // Use SyncKit's useSyncDocument hook to sync the content
  const [doc, { update }] = useSyncDocument<{ content: string }>(documentId)

  useEffect(() => {
    if (!editorRef.current) return

    // Get language extension
    const getLanguageExtension = () => {
      switch (language) {
        case 'javascript':
        case 'typescript':
          return javascript({ typescript: language === 'typescript' })
        case 'markdown':
          return markdown()
        default:
          return []
      }
    }

    // Initialize editor state
    const startState = EditorState.create({
      doc: doc?.content || '# Welcome to SyncKit Collaborative Editor\n\nStart typing to see real-time sync in action!',
      extensions: [
        basicSetup,
        getLanguageExtension(),
        EditorView.updateListener.of((updateEvent) => {
          if (updateEvent.docChanged) {
            const content = updateEvent.state.doc.toString()
            update({ content })
          }
        }),
        EditorView.theme({
          '&': {
            height: '100%',
          },
          '.cm-scroller': {
            overflow: 'auto',
          },
          '.cm-content': {
            padding: '16px',
          },
        }),
      ],
    })

    // Create editor view
    const view = new EditorView({
      state: startState,
      parent: editorRef.current,
    })

    viewRef.current = view

    // Cleanup
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [documentId, language])

  // Update editor content when document changes from remote
  useEffect(() => {
    if (!viewRef.current || !doc) return

    const currentContent = viewRef.current.state.doc.toString()
    if (currentContent !== doc.content) {
      const transaction = viewRef.current.state.update({
        changes: {
          from: 0,
          to: currentContent.length,
          insert: doc.content,
        },
      })
      viewRef.current.dispatch(transaction)
    }
  }, [doc?.content])

  return <div ref={editorRef} style={{ height: '100%', overflow: 'hidden' }} />
}
