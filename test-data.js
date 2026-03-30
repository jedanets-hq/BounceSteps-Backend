const { Pool } = require('pg');

// PostgreSQL connection
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'LMS_MUST_DB_ORG',
  password: '@Jctnftr01',
  port: 5432,
});

const insertTestData = async () => {
  try {
    console.log('Inserting test data...');

    // Insert colleges
    const collegeResult = await pool.query(`
      INSERT INTO colleges (name, short_name, description, established) 
      VALUES 
        ('College of Informatics and Virtual Education', 'CIVE', 'Leading college in technology and digital innovation', '2010'),
        ('College of Engineering and Technology', 'CET', 'Excellence in engineering and technical education', '2008'),
        ('College of Business and Economics', 'CBE', 'Business and economic development center', '2012')
      ON CONFLICT DO NOTHING
      RETURNING id, name
    `);
    console.log('Colleges inserted:', collegeResult.rows);

    // Get college IDs
    const colleges = await pool.query('SELECT id, name FROM colleges ORDER BY id');
    const collegeIds = colleges.rows;
    console.log('Available colleges:', collegeIds);

    // Insert departments using actual college IDs
    const departmentResult = await pool.query(`
      INSERT INTO departments (name, college_id, head_of_department, description) 
      VALUES 
        ('Department of Computer Science', $1, 'Dr. John Mwalimu', 'Computer science and software engineering'),
        ('Department of Information Technology', $1, 'Dr. Grace Kimaro', 'Information systems and technology management'),
        ('Department of Civil Engineering', $2, 'Dr. Peter Moshi', 'Infrastructure and construction engineering'),
        ('Department of Business Administration', $3, 'Dr. Mary Lyimo', 'Business management and administration')
      ON CONFLICT DO NOTHING
      RETURNING id, name
    `, [collegeIds[0]?.id, collegeIds[1]?.id, collegeIds[2]?.id]);
    console.log('Departments inserted:', departmentResult.rows);

    // Get department IDs
    const departments = await pool.query('SELECT id, name FROM departments ORDER BY id');
    const departmentIds = departments.rows;
    console.log('Available departments:', departmentIds);

    // Insert courses using actual department IDs
    const courseResult = await pool.query(`
      INSERT INTO courses (name, code, department_id, credits, description) 
      VALUES 
        ('Bachelor of Computer Science', 'BCS101', $1, 120, 'Comprehensive computer science program'),
        ('Bachelor of Information Technology', 'BIT101', $2, 120, 'Information technology and systems program'),
        ('Bachelor of Civil Engineering', 'BCE101', $3, 150, 'Civil engineering and construction program'),
        ('Bachelor of Business Administration', 'BBA101', $4, 120, 'Business management and administration program')
      ON CONFLICT DO NOTHING
      RETURNING id, name
    `, [departmentIds[0]?.id, departmentIds[1]?.id, departmentIds[2]?.id, departmentIds[3]?.id]);
    console.log('Courses inserted:', courseResult.rows);

    // Insert lecturers
    const lecturerResult = await pool.query(`
      INSERT INTO lecturers (name, employee_id, specialization, email, phone, password) 
      VALUES 
        ('Dr. John Mwalimu', 'EMP001', 'Computer Science', 'john.mwalimu@must.ac.tz', '+255123456789', 'password123'),
        ('Dr. Grace Kimaro', 'EMP002', 'Information Technology', 'grace.kimaro@must.ac.tz', '+255123456790', 'password123'),
        ('Dr. Peter Moshi', 'EMP003', 'Civil Engineering', 'peter.moshi@must.ac.tz', '+255123456791', 'password123'),
        ('Dr. Mary Lyimo', 'EMP004', 'Business Administration', 'mary.lyimo@must.ac.tz', '+255123456792', 'password123')
      ON CONFLICT (employee_id) DO NOTHING
      RETURNING id, name
    `);
    console.log('Lecturers inserted:', lecturerResult.rows);

    // Get course IDs
    const courses = await pool.query('SELECT id, name FROM courses ORDER BY id');
    const courseIds = courses.rows;
    console.log('Available courses:', courseIds);

    // Insert programs using actual course IDs
    const programResult = await pool.query(`
      INSERT INTO programs (name, course_id, lecturer_name, duration, total_semesters, description) 
      VALUES 
        ('Introduction to Programming', $1, 'Dr. John Mwalimu', 3, 6, 'Basic programming concepts and algorithms'),
        ('Data Structures and Algorithms', $1, 'Dr. John Mwalimu', 3, 6, 'Advanced data structures and algorithmic thinking'),
        ('Information Systems Fundamentals', $2, 'Dr. Grace Kimaro', 3, 6, 'Core information systems concepts'),
        ('Database Management Systems', $2, 'Dr. Grace Kimaro', 3, 6, 'Database design and management')
      ON CONFLICT DO NOTHING
      RETURNING id, name
    `, [courseIds[3]?.id, courseIds[4]?.id]);
    console.log('Programs inserted:', programResult.rows);

    // Insert students using actual course IDs
    const studentResult = await pool.query(`
      INSERT INTO students (name, registration_number, academic_year, course_id, current_semester, email, phone, password) 
      VALUES 
        ('Maria Johnson', 'CS001/2024', '2024/2025', $1, 1, 'maria.johnson@student.must.ac.tz', '+255700000001', 'student123'),
        ('James Wilson', 'CS002/2024', '2024/2025', $1, 1, 'james.wilson@student.must.ac.tz', '+255700000002', 'student123'),
        ('Sarah Brown', 'IT001/2024', '2024/2025', $2, 1, 'sarah.brown@student.must.ac.tz', '+255700000003', 'student123'),
        ('David Miller', 'IT002/2024', '2024/2025', $2, 1, 'david.miller@student.must.ac.tz', '+255700000004', 'student123')
      ON CONFLICT (registration_number) DO NOTHING
      RETURNING id, name
    `, [courseIds[3]?.id, courseIds[4]?.id]);
    console.log('Students inserted:', studentResult.rows);

    console.log('✅ Test data inserted successfully!');
    
  } catch (error) {
    console.error('Error inserting test data:', error);
  } finally {
    await pool.end();
  }
};

insertTestData();
