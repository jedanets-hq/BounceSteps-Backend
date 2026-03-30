// Assignment Visibility Diagnostic Script
// Run this to check why assignments are not appearing for students

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/lms_db',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function diagnoseAssignmentVisibility(studentUsername) {
  console.log('\n========================================');
  console.log('ASSIGNMENT VISIBILITY DIAGNOSTIC');
  console.log('========================================\n');
  
  try {
    // 1. Find student
    console.log('1️⃣ CHECKING STUDENT...');
    const studentResult = await pool.query(`
      SELECT s.*, c.name as course_name
      FROM students s
      LEFT JOIN courses c ON s.course_id = c.id
      WHERE s.registration_number = $1 OR s.email = $1 OR s.name = $1
    `, [studentUsername]);
    
    if (studentResult.rows.length === 0) {
      console.log('❌ Student not found with username:', studentUsername);
      return;
    }
    
    const student = studentResult.rows[0];
    console.log('✅ Student found:');
    console.log('   ID:', student.id);
    console.log('   Name:', student.name);
    console.log('   Course ID:', student.course_id);
    console.log('   Course Name:', student.course_name);
    
    // 2. Check student's programs
    console.log('\n2️⃣ CHECKING STUDENT PROGRAMS...');
    const programsResult = await pool.query(`
      SELECT id, name, lecturer_id, lecturer_name
      FROM programs
      WHERE course_id = $1
    `, [student.course_id]);
    
    if (programsResult.rows.length === 0) {
      console.log('❌ NO PROGRAMS found for this student\'s course!');
      console.log('   This is the problem! Student needs programs assigned to their course.');
      console.log('\n   SOLUTION: Add programs to course_id', student.course_id);
      return;
    }
    
    console.log(`✅ Found ${programsResult.rows.length} program(s):`);
    programsResult.rows.forEach(p => {
      console.log(`   - ID: ${p.id}, Name: "${p.name}", Lecturer: ${p.lecturer_name || 'None'}`);
    });
    
    const studentProgramIds = programsResult.rows.map(p => p.id);
    const studentProgramNames = programsResult.rows.map(p => p.name);
    
    // 3. Check all assignments
    console.log('\n3️⃣ CHECKING ALL ASSIGNMENTS...');
    const assignmentsResult = await pool.query(`
      SELECT id, title, program_id, program_name, lecturer_name, deadline
      FROM assignments
      ORDER BY created_at DESC
    `);
    
    console.log(`📋 Total assignments in database: ${assignmentsResult.rows.length}`);
    
    if (assignmentsResult.rows.length === 0) {
      console.log('❌ NO ASSIGNMENTS exist in the database!');
      console.log('   Create some assignments first.');
      return;
    }
    
    // 4. Check which assignments match
    console.log('\n4️⃣ MATCHING ASSIGNMENTS TO STUDENT...\n');
    
    let matchedCount = 0;
    let unmatchedCount = 0;
    
    assignmentsResult.rows.forEach(assignment => {
      console.log(`📝 Assignment: "${assignment.title}"`);
      console.log(`   Program ID: ${assignment.program_id || 'NULL'}`);
      console.log(`   Program Name: "${assignment.program_name}"`);
      console.log(`   Lecturer: ${assignment.lecturer_name}`);
      
      let matched = false;
      let matchReason = '';
      
      // Check program_id match
      if (assignment.program_id && studentProgramIds.includes(assignment.program_id)) {
        matched = true;
        matchReason = `program_id ${assignment.program_id} matches`;
      }
      
      // Check program_name match
      if (!matched) {
        const assignmentProgramLower = (assignment.program_name || '').toLowerCase().trim();
        const nameMatch = studentProgramNames.some(program => {
          const programLower = (program || '').toLowerCase().trim();
          return programLower === assignmentProgramLower;
        });
        
        if (nameMatch) {
          matched = true;
          matchReason = `program_name "${assignment.program_name}" matches exactly`;
        }
      }
      
      if (matched) {
        console.log(`   ✅ VISIBLE - ${matchReason}`);
        matchedCount++;
      } else {
        console.log(`   ❌ NOT VISIBLE - No match found`);
        console.log(`      Student programs: ${studentProgramNames.join(', ')}`);
        console.log(`      Student program IDs: ${studentProgramIds.join(', ')}`);
        unmatchedCount++;
      }
      console.log('');
    });
    
    // 5. Summary
    console.log('\n========================================');
    console.log('SUMMARY');
    console.log('========================================');
    console.log(`Student: ${student.name}`);
    console.log(`Course: ${student.course_name} (ID: ${student.course_id})`);
    console.log(`Programs: ${programsResult.rows.length}`);
    console.log(`Total Assignments: ${assignmentsResult.rows.length}`);
    console.log(`✅ Visible to Student: ${matchedCount}`);
    console.log(`❌ Not Visible: ${unmatchedCount}`);
    
    if (matchedCount === 0 && assignmentsResult.rows.length > 0) {
      console.log('\n⚠️ PROBLEM IDENTIFIED:');
      console.log('   No assignments match the student\'s programs.');
      console.log('\n   POSSIBLE SOLUTIONS:');
      console.log('   1. Update assignment program_name to exactly match student program names');
      console.log('   2. Set assignment program_id to match student program IDs');
      console.log('   3. Verify lecturer is creating assignments for the correct programs');
      
      console.log('\n   STUDENT PROGRAMS:');
      programsResult.rows.forEach(p => {
        console.log(`      - "${p.name}" (ID: ${p.id})`);
      });
      
      console.log('\n   ASSIGNMENT PROGRAMS:');
      const uniqueAssignmentPrograms = [...new Set(assignmentsResult.rows.map(a => a.program_name))];
      uniqueAssignmentPrograms.forEach(name => {
        console.log(`      - "${name}"`);
      });
      
      console.log('\n   Check if names match EXACTLY (case-sensitive, no extra spaces)');
    }
    
  } catch (error) {
    console.error('❌ Error running diagnostic:', error);
  } finally {
    await pool.end();
  }
}

// Get student username from command line argument
const studentUsername = process.argv[2];

if (!studentUsername) {
  console.log('Usage: node diagnose-assignments.js <student_username>');
  console.log('Example: node diagnose-assignments.js "John Doe"');
  console.log('         node diagnose-assignments.js STU001/2024');
  process.exit(1);
}

diagnoseAssignmentVisibility(studentUsername);
