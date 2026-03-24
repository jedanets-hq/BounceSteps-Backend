// Temporary enrollment system for testing
// This will be replaced with proper database implementation

const enrollments = [
  // Example enrollments - replace with real data from admin
  { id: 1, student_id: 'ST001', program_id: 1, enrollment_date: '2024-01-15' },
  { id: 2, student_id: 'ST002', program_id: 2, enrollment_date: '2024-01-16' },
  // Add more enrollments as needed
];

const lecturerAssignments = [
  // Example lecturer-program assignments - replace with real data from admin
  { id: 1, lecturer_id: 'LEC001', program_id: 1 },
  { id: 2, lecturer_id: 'LEC002', program_id: 2 },
  // Add more assignments as needed
];

module.exports = {
  enrollments,
  lecturerAssignments
};
