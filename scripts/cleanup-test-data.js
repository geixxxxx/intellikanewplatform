const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { Pool } = require("pg");

const ROOT_DIR = path.resolve(__dirname, "..");
const UPLOADS_DIR = path.join(ROOT_DIR, "uploads");

function createPgConfig() {
  return {
    host: process.env.PGHOST || "/tmp",
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || os.userInfo().username,
    password: process.env.PGPASSWORD || undefined,
    database: process.env.APP_DB_NAME || "points_platform"
  };
}

async function unlinkIfExists(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

async function main() {
  const pool = new Pool(createPgConfig());
  const client = await pool.connect();

  try {
    await client.query("begin");

    const homeworkUploads = await client.query(
      `
        select hi.stored_name
        from homework_images hi
        join homeworks h on h.id = hi.homework_id
        where h.teacher_name like $1
      `,
      ["Мария Тестова %"]
    );

    const webinarCovers = await client.query(
      `
        select cover_image_stored_name
        from webinars
        where teacher_name like $1
          and cover_image_stored_name is not null
      `,
      ["Мария Тестова %"]
    );

    await client.query("delete from announcements where author_name like $1 or author_name like $2", [
      "Иван Тестов %",
      "Мария Тестова %"
    ]);

    await client.query("delete from webinars where teacher_name like $1", ["Мария Тестова %"]);
    await client.query("delete from homeworks where teacher_name like $1", ["Мария Тестова %"]);

    await client.query(
      `
        delete from users
        where email like $1
           or email like $2
      `,
      ["student.%@example.com", "teacher.%@example.com"]
    );

    await client.query("commit");

    for (const row of [...homeworkUploads.rows, ...webinarCovers.rows.map((item) => ({ stored_name: item.cover_image_stored_name }))]) {
      await unlinkIfExists(path.join(UPLOADS_DIR, row.stored_name));
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          removedUsers: "student.%@example.com | teacher.%@example.com",
          removedUploads: homeworkUploads.rows.length + webinarCovers.rows.length
        },
        null,
        2
      )
    );
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
