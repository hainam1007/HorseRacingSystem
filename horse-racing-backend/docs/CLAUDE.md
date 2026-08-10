# CLAUDE.md

## General

* Always explain before making large architectural changes
* Ask before installing new packages
* Never delete files unless explicitly requested
* Keep code simple and production-ready
* Follow existing project structure
* Preserve existing functionality
* When unsure, ask questions instead of making assumptions

---

## Planning

* Before coding:

  1. Analyze the current architecture
  2. Explain the implementation plan
  3. List affected files
  4. Then start coding
* Break large tasks into smaller incremental steps
* Avoid making multiple unrelated changes in one edit

---

## Simplicity

* Prefer simple and maintainable solutions
* Avoid unnecessary abstractions
* Do not create extra files unless needed
* Minimize dependencies
* Avoid overengineering

---

## Safe Editing

* Never rewrite entire files unless necessary
* Modify only related code
* Preserve comments unless refactoring
* Never overwrite user code without reason
* Show code diff summary before major edits
* Avoid unnecessary refactors

---

## Code Style

* Use async/await instead of .then()
* Use ES modules
* Prefer readable and self-documenting code
* Use consistent formatting
* Keep functions focused and small
* Prefer early returns to reduce nesting

---

## Naming Conventions

* Use clear and descriptive variable names
* Avoid unclear abbreviations
* Use camelCase for variables and functions
* Use PascalCase for React components
* Use UPPER_SNAKE_CASE for constants

---

# React Project Rules

## React Architecture

* Prefer functional components
* Keep components small and reusable
* Prefer composition over prop drilling
* Separate UI from business logic
* Use custom hooks for reusable logic
* Avoid unnecessary useEffect
* Avoid deeply nested component trees

## React State Management

* Use React Query for server state
* Keep local state minimal
* Avoid duplicated state
* Prefer derived state when possible

## React UI

* Use TailwindCSS for styling
* Keep styling consistent
* Prefer reusable UI components
* Avoid inline styles unless necessary

## React Performance

* Avoid unnecessary re-renders
* Lazy load heavy components when appropriate
* Memoize expensive calculations only when needed

---

# Node.js Backend Rules

## Backend Architecture

* Use layered architecture:

  * routes
  * controllers
  * services
  * repositories
* Controllers should stay thin
* Use service layer for business logic
* Never put SQL directly inside routes
* Keep business logic out of controllers

## API Design

* Use RESTful naming conventions
* Keep API responses consistent
* Use proper HTTP status codes
* Validate all request inputs
* Separate validation from business logic

## Error Handling

* Use centralized error handling middleware
* Never swallow errors silently
* Return meaningful error messages
* Log unexpected server errors

## Authentication & Security

* Use JWT authentication
* Never expose secrets
* Use environment variables
* Sanitize user inputs
* Validate authentication and authorization properly
* Never hardcode credentials or API keys

---

# Database Rules

## Database Safety

* Never change schema without confirmation
* Use migrations if possible
* Avoid destructive queries without approval

## Database Design

* Optimize database queries
* Avoid unnecessary database calls
* Use indexes appropriately when needed

---

# Git Workflow

## Git Rules

* Make atomic commits
* Write meaningful commit messages
* Keep commits focused on one purpose
* Review diffs before committing

---

# Project Structure

## Folder Structure

* Keep folder structure consistent
* Group related files together
* Avoid deeply nested folders
* Follow existing project organization

---

# DevOps Rules

## Docker & Environment

* Prefer Dockerized development
* Keep environment configs separated
* Avoid hardcoded ports and URLs
* Use docker-compose for local development when appropriate

## Configuration

* Store configs in environment variables
* Keep secrets out of source control

---

# Testing

## Testing Rules

* Prefer writing testable code
* Avoid tightly coupled modules
* Keep functions deterministic when possible

---

# AI Coding Behavior

## AI Assistant Workflow

* Analyze before coding
* Explain reasoning clearly
* Prefer incremental changes
* Ask for clarification if requirements are ambiguous
* Do not assume missing business logic
* Prioritize maintainability over cleverness
