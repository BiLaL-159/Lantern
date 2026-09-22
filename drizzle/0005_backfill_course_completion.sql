-- Backfill course completion (ADR-0001: completion is recorded, not derived).
-- Stamp every enrollment where the student has already completed every lesson
-- of the course, using the latest of those lesson completion times.
-- Enrollments that already have a completion time, have incomplete lessons,
-- or belong to a course with zero lessons are untouched.
UPDATE `enrollments`
SET `completed_at` = (
	SELECT max(`lp`.`completed_at`)
	FROM `lesson_progress` `lp`
	JOIN `lessons` `l` ON `l`.`id` = `lp`.`lesson_id`
	JOIN `modules` `m` ON `m`.`id` = `l`.`module_id`
	WHERE `m`.`course_id` = `enrollments`.`course_id`
		AND `lp`.`user_id` = `enrollments`.`user_id`
		AND `lp`.`status` = 'completed'
)
WHERE `enrollments`.`completed_at` IS NULL
	AND (
		SELECT count(*)
		FROM `lessons` `l`
		JOIN `modules` `m` ON `m`.`id` = `l`.`module_id`
		WHERE `m`.`course_id` = `enrollments`.`course_id`
	) > 0
	AND (
		SELECT count(*)
		FROM `lessons` `l`
		JOIN `modules` `m` ON `m`.`id` = `l`.`module_id`
		WHERE `m`.`course_id` = `enrollments`.`course_id`
	) = (
		SELECT count(DISTINCT `lp`.`lesson_id`)
		FROM `lesson_progress` `lp`
		JOIN `lessons` `l` ON `l`.`id` = `lp`.`lesson_id`
		JOIN `modules` `m` ON `m`.`id` = `l`.`module_id`
		WHERE `m`.`course_id` = `enrollments`.`course_id`
			AND `lp`.`user_id` = `enrollments`.`user_id`
			AND `lp`.`status` = 'completed'
	);
