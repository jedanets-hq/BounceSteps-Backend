# PowerShell script to add Progress Tracker endpoints to server.js

$endpointsToAdd = @"

// ============================================
// PROGRESS TRACKER API ENDPOINTS
// ============================================

// Get student progress for a specific program
app.get('/api/progress/student/:student_id', async (req, res) => {
  try {
    const { student_id } = req.params;
    const { program_name } = req.query;
    
    console.log('=== FETCHING STUDENT PROGRESS ===');
    console.log('Student ID:', student_id);
    console.log('Program:', program_name);
    
    const studentResult = await pool.query('SELECT * FROM students WHERE id = `$1', [student_id]);
    
    if (studentResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }
    
    const student = studentResult.rows[0];
    
    const assessmentStats = await pool.query(``
      SELECT 
        COUNT(*) as total_assessments,
        COUNT(CASE WHEN submitted = true THEN 1 END) as submitted_assessments,
        AVG(CASE WHEN score IS NOT NULL THEN score ELSE 0 END) as average_score
      FROM assessment_submissions
      WHERE student_id = `$1 AND program_name = `$2
    ``, [student_id, program_name]);
    
    const assignmentStats = await pool.query(``
      SELECT 
        COUNT(DISTINCT a.id) as total_assignments,
        COUNT(DISTINCT asub.assignment_id) as submitted_assignments,
        AVG(CASE WHEN asub.grade IS NOT NULL THEN asub.grade ELSE 0 END) as average_grade
      FROM assignments a
      LEFT JOIN assignment_submissions asub ON a.id = asub.assignment_id AND asub.student_id = `$1
      WHERE a.program_name = `$2
    ``, [student_id, program_name]);
    
    const liveClassStats = await pool.query(``
      SELECT 
        COUNT(DISTINCT lc.id) as total_live_classes,
        COUNT(DISTINCT lcp.class_id) as attended_live_classes
      FROM live_classes lc
      LEFT JOIN live_class_participants lcp ON lc.id = lcp.class_id AND lcp.student_id = `$1
      WHERE lc.program_name = `$2
    ``, [student_id, program_name]);
    
    const assessmentData = assessmentStats.rows[0];
    const assignmentData = assignmentStats.rows[0];
    const liveClassData = liveClassStats.rows[0];
    
    const assessmentParticipation = assessmentData.total_assessments > 0 
      ? (assessmentData.submitted_assessments / assessmentData.total_assessments * 100).toFixed(1) : 0;
    
    const assignmentParticipation = assignmentData.total_assignments > 0
      ? (assignmentData.submitted_assignments / assignmentData.total_assignments * 100).toFixed(1) : 0;
    
    const liveClassParticipation = liveClassData.total_live_classes > 0
      ? (liveClassData.attended_live_classes / liveClassData.total_live_classes * 100).toFixed(1) : 0;
    
    const overallParticipation = (
      (parseFloat(assessmentParticipation) + parseFloat(assignmentParticipation) + parseFloat(liveClassParticipation)) / 3
    ).toFixed(1);
    
    const progressData = {
      student: { id: student.id, name: student.name, registration_number: student.registration_number, email: student.email },
      program: program_name,
      assessments: {
        total: parseInt(assessmentData.total_assessments),
        submitted: parseInt(assessmentData.submitted_assessments),
        not_submitted: parseInt(assessmentData.total_assessments) - parseInt(assessmentData.submitted_assessments),
        average_score: parseFloat(assessmentData.average_score).toFixed(1),
        participation_rate: assessmentParticipation
      },
      assignments: {
        total: parseInt(assignmentData.total_assignments),
        submitted: parseInt(assignmentData.submitted_assignments),
        not_submitted: parseInt(assignmentData.total_assignments) - parseInt(assignmentData.submitted_assignments),
        average_grade: parseFloat(assignmentData.average_grade).toFixed(1),
        participation_rate: assignmentParticipation
      },
      live_classes: {
        total: parseInt(liveClassData.total_live_classes),
        attended: parseInt(liveClassData.attended_live_classes),
        not_attended: parseInt(liveClassData.total_live_classes) - parseInt(liveClassData.attended_live_classes),
        attendance_rate: liveClassParticipation
      },
      overall: {
        participation_rate: overallParticipation,
        performance_level: overallParticipation >= 80 ? 'Excellent' : overallParticipation >= 60 ? 'Good' : overallParticipation >= 40 ? 'Average' : 'Needs Improvement'
      }
    };
    
    res.json({ success: true, data: progressData });
  } catch (error) {
    console.error('Error fetching student progress:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all students progress
app.get('/api/progress/students', async (req, res) => {
  try {
    const { program_name } = req.query;
    
    const studentsResult = await pool.query(``
      SELECT DISTINCT s.id, s.name, s.registration_number, s.email
      FROM students s
      JOIN enrollments e ON s.id = e.student_id
      JOIN programs p ON e.program_id = p.id
      WHERE p.name = `$1
      ORDER BY s.name
    ``, [program_name]);
    
    const students = studentsResult.rows;
    const progressList = [];
    
    for (const student of students) {
      const assessmentStats = await pool.query(``
        SELECT COUNT(*) as total_assessments, COUNT(CASE WHEN submitted = true THEN 1 END) as submitted_assessments,
        AVG(CASE WHEN score IS NOT NULL THEN score ELSE 0 END) as average_score
        FROM assessment_submissions WHERE student_id = `$1 AND program_name = `$2
      ``, [student.id, program_name]);
      
      const assignmentStats = await pool.query(``
        SELECT COUNT(DISTINCT a.id) as total_assignments, COUNT(DISTINCT asub.assignment_id) as submitted_assignments,
        AVG(CASE WHEN asub.grade IS NOT NULL THEN asub.grade ELSE 0 END) as average_grade
        FROM assignments a LEFT JOIN assignment_submissions asub ON a.id = asub.assignment_id AND asub.student_id = `$1
        WHERE a.program_name = `$2
      ``, [student.id, program_name]);
      
      const liveClassStats = await pool.query(``
        SELECT COUNT(DISTINCT lc.id) as total_live_classes, COUNT(DISTINCT lcp.class_id) as attended_live_classes
        FROM live_classes lc LEFT JOIN live_class_participants lcp ON lc.id = lcp.class_id AND lcp.student_id = `$1
        WHERE lc.program_name = `$2
      ``, [student.id, program_name]);
      
      const assessmentData = assessmentStats.rows[0];
      const assignmentData = assignmentStats.rows[0];
      const liveClassData = liveClassStats.rows[0];
      
      const assessmentParticipation = assessmentData.total_assessments > 0 ? (assessmentData.submitted_assessments / assessmentData.total_assessments * 100).toFixed(1) : 0;
      const assignmentParticipation = assignmentData.total_assignments > 0 ? (assignmentData.submitted_assignments / assignmentData.total_assignments * 100).toFixed(1) : 0;
      const liveClassParticipation = liveClassData.total_live_classes > 0 ? (liveClassData.attended_live_classes / liveClassData.total_live_classes * 100).toFixed(1) : 0;
      const overallParticipation = ((parseFloat(assessmentParticipation) + parseFloat(assignmentParticipation) + parseFloat(liveClassParticipation)) / 3).toFixed(1);
      
      progressList.push({
        student: { id: student.id, name: student.name, registration_number: student.registration_number },
        assessments: { total: parseInt(assessmentData.total_assessments), submitted: parseInt(assessmentData.submitted_assessments), average_score: parseFloat(assessmentData.average_score).toFixed(1), participation_rate: assessmentParticipation },
        assignments: { total: parseInt(assignmentData.total_assignments), submitted: parseInt(assignmentData.submitted_assignments), average_grade: parseFloat(assignmentData.average_grade).toFixed(1), participation_rate: assignmentParticipation },
        live_classes: { total: parseInt(liveClassData.total_live_classes), attended: parseInt(liveClassData.attended_live_classes), attendance_rate: liveClassParticipation },
        overall: { participation_rate: overallParticipation, performance_level: overallParticipation >= 80 ? 'Excellent' : overallParticipation >= 60 ? 'Good' : overallParticipation >= 40 ? 'Average' : 'Needs Improvement' }
      });
    }
    
    res.json({ success: true, data: progressList });
  } catch (error) {
    console.error('Error fetching students progress:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get lecturer progress
app.get('/api/progress/lecturer/:lecturer_id', async (req, res) => {
  try {
    const { lecturer_id } = req.params;
    
    const lecturerResult = await pool.query('SELECT * FROM lecturers WHERE id = `$1', [lecturer_id]);
    if (lecturerResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lecturer not found' });
    }
    
    const lecturer = lecturerResult.rows[0];
    
    const assessmentStats = await pool.query(``
      SELECT COUNT(*) as total_assessments_created, COUNT(CASE WHEN status = 'active' THEN 1 END) as active_assessments,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_assessments FROM assessments WHERE lecturer_id = `$1
    ``, [lecturer_id]);
    
    const assignmentStats = await pool.query(``
      SELECT COUNT(*) as total_assignments_created, COUNT(CASE WHEN status = 'active' THEN 1 END) as active_assignments,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_assignments FROM assignments WHERE lecturer_id = `$1
    ``, [lecturer_id]);
    
    const liveClassStats = await pool.query(``
      SELECT COUNT(*) as total_live_classes_created, COUNT(CASE WHEN status = 'live' THEN 1 END) as active_live_classes,
      COUNT(CASE WHEN status = 'ended' THEN 1 END) as completed_live_classes FROM live_classes WHERE lecturer_id = `$1
    ``, [lecturer_id]);
    
    const announcementStats = await pool.query(``
      SELECT COUNT(*) as total_announcements FROM announcements WHERE created_by_id = `$1 AND created_by_type = 'lecturer'
    ``, [lecturer_id]);
    
    const assessmentData = assessmentStats.rows[0];
    const assignmentData = assignmentStats.rows[0];
    const liveClassData = liveClassStats.rows[0];
    const announcementData = announcementStats.rows[0];
    
    const totalActivities = parseInt(assessmentData.total_assessments_created) + parseInt(assignmentData.total_assignments_created) + parseInt(liveClassData.total_live_classes_created) + parseInt(announcementData.total_announcements);
    
    const progressData = {
      lecturer: { id: lecturer.id, name: lecturer.name, email: lecturer.email, department: lecturer.department },
      assessments: { total_created: parseInt(assessmentData.total_assessments_created), active: parseInt(assessmentData.active_assessments), completed: parseInt(assessmentData.completed_assessments) },
      assignments: { total_created: parseInt(assignmentData.total_assignments_created), active: parseInt(assignmentData.active_assignments), completed: parseInt(assignmentData.completed_assignments) },
      live_classes: { total_created: parseInt(liveClassData.total_live_classes_created), active: parseInt(liveClassData.active_live_classes), completed: parseInt(liveClassData.completed_live_classes) },
      announcements: { total_created: parseInt(announcementData.total_announcements) },
      overall: {
        total_activities: totalActivities,
        activity_level: totalActivities >= 20 ? 'Very Active' : totalActivities >= 10 ? 'Active' : 'Moderate'
      }
    };
    
    res.json({ success: true, data: progressData });
  } catch (error) {
    console.error('Error fetching lecturer progress:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

"@

# Check if endpoints already exist
$serverContent = Get-Content "backend/server.js" -Raw
if ($serverContent -match "api/progress/student") {
    Write-Host "✅ Progress Tracker endpoints already exist in server.js"
} else {
    # Find the last app.listen or module.exports line
    $lines = Get-Content "backend/server.js"
    $insertIndex = -1
    
    for ($i = $lines.Count - 1; $i -ge 0; $i--) {
        if ($lines[$i] -match "app\.listen|module\.exports") {
            $insertIndex = $i
            break
        }
    }
    
    if ($insertIndex -gt 0) {
        # Insert endpoints before app.listen
        $newContent = ($lines[0..($insertIndex-1)] -join "`n") + "`n" + $endpointsToAdd + "`n" + ($lines[$insertIndex..($lines.Count-1)] -join "`n")
        $newContent | Set-Content "backend/server.js" -NoNewline
        Write-Host "✅ Progress Tracker endpoints added to server.js"
    } else {
        # Append to end of file
        Add-Content "backend/server.js" $endpointsToAdd
        Write-Host "✅ Progress Tracker endpoints appended to server.js"
    }
}
