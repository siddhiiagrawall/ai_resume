import { createJob } from '../src/services/neo4j/jobService.js';
import { driver } from '../src/config/neo4j.js';
import dotenv from 'dotenv';

dotenv.config();

const jobDescriptions = [
  {
    title: 'Senior Full Stack Developer',
    description: `We are seeking a Senior Full Stack Developer to join our dynamic team. You will be responsible for designing, developing, and maintaining web applications from frontend to backend.

Key Responsibilities:
- Develop and maintain scalable web applications using React, Node.js, and TypeScript
- Design and implement RESTful APIs and GraphQL endpoints
- Build responsive user interfaces with modern CSS frameworks (Tailwind CSS)
- Work with databases including PostgreSQL, MongoDB, and Neo4j
- Implement authentication and authorization systems
- Write unit and integration tests
- Collaborate with cross-functional teams including designers and product managers
- Deploy applications to cloud platforms (AWS, Azure, or GCP)
- Optimize application performance and ensure security best practices

Required Skills:
- 5+ years of experience in full stack development
- Proficiency in JavaScript, TypeScript, React, Node.js
- Experience with SQL and NoSQL databases
- Knowledge of RESTful API design
- Familiarity with Git version control
- Understanding of cloud services (AWS preferred)
- Strong problem-solving and communication skills
- Experience with Docker and containerization
- Knowledge of CI/CD pipelines`
  },
  {
    title: 'Backend Engineer - Node.js',
    description: `Join our backend engineering team to build robust, scalable server-side applications. You'll work on API development, database optimization, and microservices architecture.

Key Responsibilities:
- Design and develop high-performance RESTful APIs using Node.js and Express
- Implement database schemas and optimize queries for PostgreSQL and MongoDB
- Build microservices architecture with proper service communication
- Implement authentication and authorization using JWT and OAuth
- Write comprehensive unit and integration tests
- Monitor and optimize application performance
- Implement caching strategies using Redis
- Work with message queues (RabbitMQ, Kafka)
- Ensure code quality through code reviews and best practices
- Collaborate with frontend developers and DevOps teams

Required Skills:
- 4+ years of backend development experience
- Strong proficiency in Node.js, Express, and TypeScript
- Deep understanding of SQL and NoSQL databases
- Experience with GraphQL
- Knowledge of API design principles
- Familiarity with Docker and Kubernetes
- Understanding of cloud platforms (AWS, Azure)
- Experience with testing frameworks (Jest, Mocha)
- Knowledge of CI/CD practices
- Strong understanding of system design and architecture`
  },
  {
    title: 'Frontend Developer - React Specialist',
    description: `We're looking for a talented Frontend Developer to create exceptional user experiences. You'll work with modern React ecosystem to build responsive, performant web applications.

Key Responsibilities:
- Develop responsive web applications using React, TypeScript, and Next.js
- Build reusable component libraries and design systems
- Implement state management using Redux, Zustand, or Context API
- Optimize applications for performance and SEO
- Write clean, maintainable code following best practices
- Collaborate with UI/UX designers to implement designs
- Conduct code reviews and mentor junior developers
- Implement accessibility standards (WCAG)
- Work with CSS-in-JS solutions (Styled Components, Emotion)
- Integrate with RESTful and GraphQL APIs

Required Skills:
- 3+ years of frontend development experience
- Expert knowledge of React, JavaScript, and TypeScript
- Experience with Next.js or similar frameworks
- Proficiency in HTML5, CSS3, and modern CSS frameworks
- Understanding of state management patterns
- Knowledge of build tools (Webpack, Vite)
- Experience with testing libraries (React Testing Library, Jest)
- Familiarity with version control (Git)
- Understanding of responsive design principles
- Knowledge of performance optimization techniques`
  },
  {
    title: 'Full Stack Developer - MERN Stack',
    description: `Join our team as a Full Stack Developer specializing in the MERN (MongoDB, Express, React, Node.js) stack. Build end-to-end solutions for our growing platform.

Key Responsibilities:
- Develop full-stack applications using MongoDB, Express, React, and Node.js
- Design and implement database schemas and models
- Create RESTful APIs and integrate frontend with backend services
- Build interactive user interfaces with React and modern hooks
- Implement user authentication and session management
- Write and maintain comprehensive test suites
- Deploy applications to production environments
- Optimize database queries and application performance
- Work with third-party APIs and services
- Participate in agile development processes

Required Skills:
- 3+ years of MERN stack development
- Strong knowledge of JavaScript, ES6+, and TypeScript
- Experience with MongoDB and Mongoose
- Proficiency in Express.js and Node.js
- Solid understanding of React and React Hooks
- Knowledge of RESTful API development
- Familiarity with Git and version control
- Understanding of authentication mechanisms
- Experience with testing frameworks
- Good understanding of software development lifecycle`
  },
  {
    title: 'Backend Developer - Python/Django',
    description: `We're seeking a Backend Developer with Python and Django expertise to build scalable web services and APIs. Work on high-traffic applications serving millions of users.

Key Responsibilities:
- Develop and maintain backend services using Python and Django/Django REST Framework
- Design and implement database models and migrations
- Build RESTful APIs and GraphQL endpoints
- Implement caching strategies and optimize database performance
- Write unit tests and integration tests using pytest
- Work with PostgreSQL and Redis
- Implement background job processing with Celery
- Monitor application performance and resolve issues
- Collaborate with frontend teams and product managers
- Ensure code quality and follow best practices

Required Skills:
- 4+ years of Python backend development
- Strong experience with Django and Django REST Framework
- Proficiency in SQL and database design
- Knowledge of RESTful API design principles
- Experience with PostgreSQL
- Familiarity with Redis and caching
- Understanding of Celery and async task processing
- Knowledge of Docker and containerization
- Experience with testing frameworks (pytest)
- Strong problem-solving and debugging skills`
  },
  {
    title: 'Frontend Engineer - Vue.js',
    description: `Looking for a Frontend Engineer to build modern web applications using Vue.js. You'll work on creating intuitive user interfaces and improving user experience.

Key Responsibilities:
- Develop single-page applications using Vue.js 3 and Composition API
- Build reusable Vue components and maintain component libraries
- Implement state management using Pinia or Vuex
- Optimize applications for performance and SEO
- Work with TypeScript for type safety
- Integrate with RESTful APIs and GraphQL
- Collaborate with designers to implement pixel-perfect designs
- Write unit tests using Vitest or Jest
- Implement responsive design principles
- Stay updated with latest Vue.js ecosystem trends

Required Skills:
- 3+ years of frontend development experience
- Strong proficiency in Vue.js 2/3 and JavaScript
- Experience with Vue Router and state management
- Knowledge of TypeScript
- Understanding of HTML5, CSS3, and modern CSS
- Familiarity with build tools (Vite, Webpack)
- Experience with testing frameworks
- Knowledge of Git version control
- Understanding of responsive design
- Good communication and collaboration skills`
  },
  {
    title: 'Generative AI Engineer',
    description: `Join our AI team as a Generative AI Engineer to build cutting-edge AI applications using large language models and generative AI technologies.

Key Responsibilities:
- Develop and fine-tune large language models (LLMs) for specific use cases
- Build RAG (Retrieval-Augmented Generation) systems
- Implement prompt engineering strategies for optimal model performance
- Work with LangChain, LangGraph, and other AI frameworks
- Integrate OpenAI, Anthropic, and open-source models
- Build vector databases and embedding systems
- Develop AI-powered applications and chatbots
- Optimize model inference and reduce latency
- Implement memory systems for conversational AI
- Collaborate with data scientists and ML engineers

Required Skills:
- 3+ years of experience in AI/ML development
- Strong Python programming skills
- Experience with LLMs (GPT, Claude, Llama)
- Knowledge of LangChain, LangGraph, or similar frameworks
- Understanding of vector databases (Pinecone, Chroma, Weaviate)
- Experience with embedding models and semantic search
- Familiarity with prompt engineering techniques
- Knowledge of RAG architecture
- Understanding of transformer models
- Experience with cloud AI services (OpenAI, Anthropic)`
  },
  {
    title: 'Full Stack AI Developer',
    description: `We're looking for a Full Stack AI Developer who can build end-to-end AI-powered applications. Combine full stack development with AI/ML expertise.

Key Responsibilities:
- Develop full-stack applications with integrated AI capabilities
- Build AI-powered features using LLMs and generative AI
- Implement RAG systems for document Q&A
- Create user interfaces for AI applications
- Develop APIs for AI model integration
- Work with vector databases and embedding systems
- Implement conversational AI interfaces
- Optimize AI model performance and costs
- Deploy AI applications to production
- Monitor and maintain AI systems

Required Skills:
- 4+ years of full stack development
- 2+ years of AI/ML experience
- Proficiency in Python, JavaScript, React, Node.js
- Experience with LangChain, LangGraph
- Knowledge of LLMs (OpenAI, Anthropic, open-source)
- Understanding of vector databases
- Experience with RAG implementation
- Strong backend and frontend skills
- Knowledge of cloud platforms
- Excellent problem-solving abilities`
  },
  {
    title: 'Backend Developer - AI/ML Integration',
    description: `Join our backend team to build robust APIs and services that power AI applications. Focus on integrating AI models into production systems.

Key Responsibilities:
- Develop backend services for AI-powered applications
- Integrate LLM APIs (OpenAI, Anthropic) into backend systems
- Build APIs for AI model inference and management
- Implement vector database integrations
- Create data pipelines for AI model training
- Optimize API performance for AI workloads
- Implement caching and rate limiting for AI services
- Monitor AI service costs and usage
- Build microservices for AI components
- Ensure scalability and reliability

Required Skills:
- 4+ years of backend development
- Experience with Python, Node.js, or Go
- Knowledge of AI/ML model integration
- Experience with LLM APIs
- Understanding of vector databases
- Familiarity with LangChain or similar
- Strong API design skills
- Knowledge of microservices architecture
- Experience with cloud platforms
- Understanding of AI model deployment`
  },
  {
    title: 'AI Application Developer',
    description: `We're seeking an AI Application Developer to build production-ready AI applications. Work on chatbots, document analysis, and AI-powered features.

Key Responsibilities:
- Build AI applications using modern frameworks
- Implement conversational AI and chatbots
- Develop document processing and analysis systems
- Create AI-powered search and recommendation systems
- Integrate multiple AI models and services
- Build user interfaces for AI applications
- Implement prompt engineering and fine-tuning
- Optimize AI application performance
- Handle AI model versioning and deployment
- Monitor and improve AI system accuracy

Required Skills:
- 3+ years of software development
- 2+ years of AI/ML application development
- Proficiency in Python and JavaScript
- Experience with LangChain, LangGraph
- Knowledge of LLMs and generative AI
- Understanding of RAG systems
- Experience with vector databases
- Strong full stack capabilities
- Knowledge of AI model APIs
- Excellent debugging and optimization skills`
  }
];

async function seedJobs() {
  console.log('🌱 Starting job seeding...\n');
  
  try {
    // Test Neo4j connection
    const session = driver.session();
    await session.run('RETURN 1');
    await session.close();
    console.log('✅ Neo4j connection verified\n');
    
    // Create jobs
    for (let i = 0; i < jobDescriptions.length; i++) {
      const job = jobDescriptions[i];
      console.log(`Creating job ${i + 1}/${jobDescriptions.length}: ${job.title}...`);
      
      try {
        const createdJob = await createJob(job.title, job.description);
        console.log(`✅ Created: ${createdJob.title}`);
        console.log(`   Skills extracted: ${createdJob.skills.length}`);
        console.log(`   ID: ${createdJob.id}\n`);
      } catch (error) {
        console.error(`❌ Error creating job "${job.title}":`, error);
      }
    }
    
    console.log('🎉 Job seeding completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seedJobs();

