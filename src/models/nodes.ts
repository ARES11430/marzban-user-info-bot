import { RowDataPacket } from 'mysql2';
import pool from '../database/db';

export interface Node extends RowDataPacket {
  id: number;
  name: string;
  status: 'connected' | 'connecting' | 'error' | 'disabled';
  last_status_change: Date;
  message: string | null;
  address: string;
}

export const getNodes = async (): Promise<Node[]> => {
  const [rows] = await pool.query(`
    SELECT id, name, status, last_status_change, message, address
    FROM nodes
  `);
  return rows as Node[];
};

