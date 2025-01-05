import moment from "moment-timezone";
import { RowDataPacket } from "mysql2";
import pool from "../database/db";

interface IUserTrafficLimit extends RowDataPacket {
  username: string;
  remainingTraffic: number;
}

interface IExpiringUser extends RowDataPacket {
  username: string;
  expirationDate: string;
}

interface IExpiringUsersResult {
  today: { username: string }[];
  tomorrow: { username: string }[];
}

interface IAdmin extends RowDataPacket {
  id: number;
  username: string;
}

export const getAdminID = async (username: string): Promise<number | null> => {
  const query = `SELECT id FROM admins WHERE username = ? LIMIT 1`;

  const [rows] = await pool.query<IAdmin[]>(query, [username]);

  return rows[0]?.id || null;
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
  return rows.map((user) => ({
    username: user.username,
    remainingTraffic: (user.remainingTraffic / (1024 * 1024 * 1024)).toFixed(2), // Convert bytes to GB and format
  }));
};

export const getExpiringUsers = async (
  adminID?: number
): Promise<IExpiringUsersResult> => {
  // Get the configured time zone from environment or default to UTC
  const timeZone = process.env.TZ || "UTC";

  // Calculate today and tomorrow and day after tomorrow in the specified time zone
  const todayStart = moment.tz(timeZone).startOf("day");
  const tomorrowStart = moment(todayStart).add(1, "day");
  const dayAfterTomorrowStart = moment(todayStart).add(2, "day");

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
  todayRows.forEach((user) => {
    result.today.push({ username: user.username });
  });

  // Format and categorize the users for tomorrow
  tomorrowRows.forEach((user) => {
    result.tomorrow.push({ username: user.username });
  });

  return result;
};
