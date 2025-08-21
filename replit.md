# Audio Transcription Application

## Overview

This is a full-stack audio transcription application built with React and Express that allows users to upload audio files and receive AI-powered transcriptions using OpenAI's Whisper API. The application features a modern, responsive interface built with shadcn/ui components and provides real-time feedback during the transcription process.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Library**: shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens and CSS variables
- **State Management**: TanStack Query for server state management
- **Routing**: Wouter for lightweight client-side routing
- **File Handling**: Custom file upload components with drag-and-drop support

### Backend Architecture
- **Runtime**: Node.js with Express.js server
- **Language**: TypeScript with ES modules
- **API Design**: RESTful endpoints with proper error handling and logging
- **File Processing**: Multer for handling multipart file uploads
- **AI Integration**: OpenAI API for audio transcription using Whisper model

### Data Storage Solutions
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Connection**: Neon Database serverless PostgreSQL
- **Schema**: Structured transcription records with metadata tracking
- **Temporary Storage**: In-memory storage fallback for development

### Authentication and Authorization
- Currently uses a simple in-memory storage system
- No authentication layer implemented (suitable for single-user or demo applications)

### File Upload and Processing
- **Upload Constraints**: 10MB file size limit, supports MP3, WAV, M4A formats
- **Validation**: Client and server-side file type and size validation
- **Processing Pipeline**: Upload → Validation → OpenAI Transcription → Storage → Response
- **Progress Tracking**: Real-time upload and processing progress indicators

### Error Handling and User Experience
- **Comprehensive Error States**: Detailed error messages with suggested solutions
- **Progress Feedback**: Multi-step progress indicators during processing
- **Toast Notifications**: User-friendly success and error notifications
- **Responsive Design**: Mobile-first approach with adaptive layouts

## External Dependencies

### Core Framework Dependencies
- **React 18**: Frontend framework with modern hooks and concurrent features
- **Express.js**: Node.js web framework for API development
- **TypeScript**: Type safety across the entire application
- **Vite**: Fast build tool with hot module replacement

### UI and Styling
- **Radix UI**: Accessible component primitives for complex UI elements
- **Tailwind CSS**: Utility-first CSS framework with custom configuration
- **Lucide React**: Consistent icon library
- **shadcn/ui**: Pre-built component library with customizable design system

### Database and ORM
- **Drizzle ORM**: Type-safe database operations with PostgreSQL
- **Neon Database**: Serverless PostgreSQL for production deployment
- **Drizzle Kit**: Database migration and schema management tools

### File Processing and AI
- **OpenAI API**: Whisper model for audio-to-text transcription
- **Multer**: Middleware for handling multipart/form-data file uploads
- **File System**: Native Node.js fs module for temporary file handling

### Development and Build Tools
- **ESBuild**: Fast JavaScript bundler for production builds
- **PostCSS**: CSS processing with Tailwind CSS integration
- **TypeScript Compiler**: Type checking and compilation
- **Replit Integration**: Development environment optimization and error handling

### State Management and Data Fetching
- **TanStack Query**: Powerful data synchronization for server state
- **React Hook Form**: Form state management with validation
- **Zod**: Schema validation for type-safe data parsing

The application follows a modern full-stack architecture with clear separation of concerns, comprehensive error handling, and a focus on user experience. The modular component structure and type-safe development approach ensure maintainability and scalability.