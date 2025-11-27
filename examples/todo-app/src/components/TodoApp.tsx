import React, { useState } from 'react'
import { useSyncDocument } from '@synckit-js/sdk'
import type { TodoListDocument, Todo } from '../types'
import TodoItem from './TodoItem'
import './TodoApp.css'

const DOCUMENT_ID = 'todo-list'

export default function TodoApp() {
  const [newTodoText, setNewTodoText] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all')
  
  // Use SyncKit's React hook to sync the todo list
  // useSyncDocument returns [data, { set, update, delete }, doc]
  const [document, { update: updateDocument }] = useSyncDocument<TodoListDocument>(DOCUMENT_ID)
  
  const todos = document?.todos || {}
  const todoList = Object.values(todos)
  
  // Filter todos based on selected filter
  const filteredTodos = todoList.filter((todo) => {
    if (filter === 'active') return !todo.completed
    if (filter === 'completed') return todo.completed
    return true
  })
  
  // Stats
  const activeCount = todoList.filter((t) => !t.completed).length
  const completedCount = todoList.filter((t) => t.completed).length
  
  // Add new todo
  const handleAddTodo = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTodoText.trim()) return
    
    const newTodo: Todo = {
      id: crypto.randomUUID(),
      text: newTodoText.trim(),
      completed: false,
      createdAt: Date.now(),
    }
    
    updateDocument({
      todos: {
        ...todos,
        [newTodo.id]: newTodo,
      },
      lastUpdated: Date.now(),
    })
    
    setNewTodoText('')
  }
  
  // Toggle todo completion
  const handleToggle = (id: string) => {
    const todo = todos[id]
    if (!todo) return
    
    updateDocument({
      todos: {
        ...todos,
        [id]: { ...todo, completed: !todo.completed },
      },
      lastUpdated: Date.now(),
    })
  }
  
  // Delete todo
  const handleDelete = (id: string) => {
    const newTodos = { ...todos }
    delete newTodos[id]
    
    updateDocument({
      todos: newTodos,
      lastUpdated: Date.now(),
    })
  }
  
  // Clear completed
  const handleClearCompleted = () => {
    const newTodos = Object.fromEntries(
      Object.entries(todos).filter(([_, todo]) => !todo.completed)
    )
    
    updateDocument({
      todos: newTodos,
      lastUpdated: Date.now(),
    })
  }
  
  return (
    <div className="todo-app">
      <div className="todo-container">
        <h1>📝 SyncKit Todo</h1>
        <p className="subtitle">
          A local-first todo app powered by SyncKit
        </p>
        
        {/* Add Todo Form */}
        <form onSubmit={handleAddTodo} className="add-todo-form">
          <input
            type="text"
            value={newTodoText}
            onChange={(e) => setNewTodoText(e.target.value)}
            placeholder="What needs to be done?"
            className="todo-input"
          />
          <button type="submit" className="add-button">
            Add
          </button>
        </form>
        
        {/* Filter Tabs */}
        <div className="filters">
          <button
            className={filter === 'all' ? 'active' : ''}
            onClick={() => setFilter('all')}
          >
            All ({todoList.length})
          </button>
          <button
            className={filter === 'active' ? 'active' : ''}
            onClick={() => setFilter('active')}
          >
            Active ({activeCount})
          </button>
          <button
            className={filter === 'completed' ? 'active' : ''}
            onClick={() => setFilter('completed')}
          >
            Completed ({completedCount})
          </button>
        </div>
        
        {/* Todo List */}
        <div className="todo-list">
          {filteredTodos.length === 0 ? (
            <div className="empty-state">
              {filter === 'all' && '🎉 No todos yet. Add one above!'}
              {filter === 'active' && '✅ All done! No active todos.'}
              {filter === 'completed' && '📋 No completed todos yet.'}
            </div>
          ) : (
            filteredTodos
              .sort((a, b) => b.createdAt - a.createdAt)
              .map((todo) => (
                <TodoItem
                  key={todo.id}
                  todo={todo}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                />
              ))
          )}
        </div>
        
        {/* Footer */}
        {completedCount > 0 && (
          <div className="footer">
            <button onClick={handleClearCompleted} className="clear-button">
              Clear completed ({completedCount})
            </button>
          </div>
        )}
        
        {/* Sync Status */}
        <div className="sync-status">
          <span className="status-indicator">●</span>
          <span>Synced locally with IndexedDB</span>
        </div>
      </div>
    </div>
  )
}
