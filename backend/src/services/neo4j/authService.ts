import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { getSession } from '../../config/neo4j.js';

export type UserRole = 'RECRUITER' | 'CANDIDATE';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

/**
 * createUser — registers a new user in the Neo4j graph database.
 */
export async function createUser(email: string, name: string, passwordPlain: string, role: UserRole): Promise<User> {
  const session = getSession();
  try {
    const passwordHash = await bcrypt.hash(passwordPlain, 10);
    const id = uuidv4();

    // The node label depends on the role for faster querying later
    const label = role === 'RECRUITER' ? 'Recruiter' : 'Candidate';
    const query = `
      CREATE (u:User:${label} {
        id: $id,
        email: $email,
        name: $name,
        passwordHash: $passwordHash,
        role: $role,
        createdAt: datetime()
      })
      RETURN u
    `;

    const result = await session.run(query, { id, email, name, passwordHash, role });
    const node = result.records[0].get('u').properties;

    return {
      id: node.id,
      email: node.email,
      name: node.name,
      role: node.role as UserRole,
      createdAt: node.createdAt.toString()
    };
  } finally {
    await session.close();
  }
}

/**
 * verifyUser — checks email & password and returns the User if valid.
 */
export async function verifyUser(email: string, passwordPlain: string): Promise<User | null> {
  const session = getSession();
  try {
    const query = `MATCH (u:User {email: $email}) RETURN u`;
    const result = await session.run(query, { email });

    if (result.records.length === 0) {
      return null;
    }

    const node = result.records[0].get('u').properties;
    
    // Compare password hashes
    const isValid = await bcrypt.compare(passwordPlain, node.passwordHash);
    if (!isValid) {
      return null;
    }

    return {
      id: node.id,
      email: node.email,
      name: node.name,
      role: node.role as UserRole,
      createdAt: node.createdAt.toString()
    };
  } finally {
    await session.close();
  }
}

export async function getUserById(id: string): Promise<User | null> {
  const session = getSession();
  try {
    const query = `MATCH (u:User {id: $id}) RETURN u`;
    const result = await session.run(query, { id });

    if (result.records.length === 0) {
      return null;
    }

    const node = result.records[0].get('u').properties;
    return {
      id: node.id,
      email: node.email,
      name: node.name,
      role: node.role as UserRole,
      createdAt: node.createdAt.toString()
    };
  } finally {
    await session.close();
  }
}
