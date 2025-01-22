import moment from 'moment-timezone';
import { RowDataPacket } from 'mysql2';
import pool from '../database/db';
import { getTimeZone } from '../utils/utils';

interface IUserTrafficLimit extends RowDataPacket {
  username: string;
  remainingTraffic: number;
}

interface IExpiringUser extends RowDataPacket {
  username: string;
  expirationDate: string;
}

interface ISubscribedAt extends RowDataPacket {
  username: string;
  lastUpdate: Date;
}

interface IExpiringUsersResult {
  today: { username: string }[];
  tomorrow: { username: string }[];
}

interface IAdmin extends RowDataPacket {
  id: number;
  username: string;
}

export interface IUserInfo extends RowDataPacket {
  id: number;
  username: string;
  status: string;
  dataLimit: number | null;
  remainingTraffic: number;
  adminId: number;
  belongsTo: string;
  note: string;
  expirationDate: Date | null;
  onlineAt: Date;
  subUpdatedAt: Date;
  subLastUserAgent: string;
}

interface IClient extends RowDataPacket {
  username: string;
  client: string;
  lastUpdate: Date;
}

interface IUsername extends RowDataPacket {
  username: string;
}

export const getAdminID = async (username: string): Promise<number | null> => {
  const query = `SELECT id FROM admins WHERE username = ? LIMIT 1`;

  const [rows] = await pool.query<IAdmin[]>(query, [username]);

  return rows[0]?.id || null;
};

export const getUsersFromDB = async () => {
  const query = `SELECT username FROM users`;
  const [rows] = await pool.query<IUsername[]>(query);
  return rows;
};

export const getUserInfo = async (
  username: string,
  adminID?: number
): Promise<IUserInfo> => {
  const query = `SELECT
  u.id,
  u.username,
  u.status,
  FROM_UNIXTIME(expire) AS expirationDate,
  u.data_limit AS dataLimit,
  (u.data_limit - u.used_traffic) AS remainingTraffic,
  u.admin_id AS adminId,
  u.note,
  u.online_at AS onlineAt,
  u.sub_updated_at AS subUpdatedAt, 
  u.sub_last_user_agent AS subLastUserAgent,
  a.username AS belongsTo
  FROM users u
  JOIN admins a ON u.admin_id = a.id
  WHERE LOWER(u.username) = LOWER(?)
  ${adminID ? 'AND u.admin_id = ?' : ''} 
  LIMIT 1`;

  const [rows] = await pool.query<IUserInfo[]>(
    query,
    adminID ? [username, adminID] : [username]
  );

  return rows[0] || 'No user found with this username 😥';
};

export const getClients = async (client: string, adminID?: number) => {
  const query = `SELECT
   username,
   sub_last_user_agent AS client,
   sub_updated_at AS lastUpdate
   FROM users 
   WHERE sub_last_user_agent LIKE CONCAT('%', ?, '%')
   ${adminID ? `AND admin_id = ?` : ``}
   AND 
      status = 'active'
  `;

  const [rows] = await pool.query<IClient[]>(query, [client, adminID]);

  // Return the formatted result
  return (
    rows.map(user => ({
      username: user.username,
      client: user.client,
      lastUpdate: user.lastUpdate,
    })) || 'No user is using this client'
  );
};

export const getOutdatedSubscriptionUsers = async (
  days: number,
  adminID?: number
) => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const query = `
    SELECT 
      username,
      sub_updated_at AS lastUpdate
    FROM 
      users 
    WHERE 
      sub_updated_at < ?
    ${adminID ? `AND admin_id = ?` : ``}
    AND 
      status = 'active'
  `;

  const [rows] = await pool.query<ISubscribedAt[]>(
    query,
    [cutoffDate, adminID].filter(Boolean)
  );

  return rows;
};

export const getLowTrafficUsers = async (traffic: number, adminID?: number) => {
  const trafficInBytes = traffic * 1024 * 1024 * 1024; // GB in bytes
  const query = `
    SELECT 
      username, 
      (data_limit - used_traffic) AS remainingTraffic 
    FROM 
      users
    WHERE 
      (data_limit - used_traffic) < ? 
    ${adminID ? `AND admin_id = ?` : ``}
    AND 
      status = 'active'
  `;

  // Destructure the result from the query
  const [rows] = await pool.query<IUserTrafficLimit[]>(query, [
    trafficInBytes,
    adminID,
  ]);

  // Return the formatted result
  return rows.map(user => ({
    username: user.username,
    remainingTraffic: (user.remainingTraffic / (1024 * 1024 * 1024)).toFixed(2), // Convert bytes to GB and format
  }));
};

export const getExpiringUsers = async (
  adminID?: number
): Promise<IExpiringUsersResult> => {
  const timeZone = await getTimeZone();

  // Calculate today and tomorrow and day after tomorrow in the specified time zone
  const todayStart = moment.tz(timeZone).startOf('day');
  const tomorrowStart = moment(todayStart).add(1, 'day');
  const dayAfterTomorrowStart = moment(todayStart).add(2, 'day');

  // Convert to ISO string for SQL query
  const todayStartISOString = todayStart.toISOString();
  const tomorrowStartISOString = tomorrowStart.toISOString();
  const dayAfterTomorrowStartISOString = dayAfterTomorrowStart.toISOString();

  const query = `
	  SELECT 
	    username, 
	    FROM_UNIXTIME(expire) AS expirationDate
	  FROM 
	    users
	  WHERE 
	    expire >= UNIX_TIMESTAMP(?)  -- Expiration today or after
	    AND 
	    expire < UNIX_TIMESTAMP(?)   -- Expiration before tomorrow
	    AND 
	    status = 'active'
	    ${adminID ? `AND admin_id = ?` : ``}
	`;

  // Execute query for "today"
  const [todayRows] = await pool.query<IExpiringUser[]>(query, [
    todayStartISOString,
    tomorrowStartISOString,
    adminID,
  ]);

  // Execute query for "tomorrow"
  const [tomorrowRows] = await pool.query<IExpiringUser[]>(query, [
    tomorrowStartISOString,
    dayAfterTomorrowStartISOString,
    adminID,
  ]);

  // Initialize the result for today and tomorrow
  const result: IExpiringUsersResult = {
    today: [],
    tomorrow: [],
  };

  // Format and categorize the users for today
  todayRows.forEach(user => {
    result.today.push({ username: user.username });
  });

  // Format and categorize the users for tomorrow
  tomorrowRows.forEach(user => {
    result.tomorrow.push({ username: user.username });
  });

  return result;
};
