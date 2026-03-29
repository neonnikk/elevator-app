/**
 * validate.js — middleware валидации тела запроса.
 *
 * Использование в роутерах:
 *   router.post('/', validateBody({
 *     name:    { required: true, type: 'string', minLength: 2, maxLength: 100 },
 *     due_day: { required: true, type: 'number', min: 1, max: 31 },
 *     status:  { enum: ['pending', 'completed'] },
 *   }), handler);
 *
 * При ошибке возвращает 400 с первой найденной ошибкой и массивом всех ошибок:
 *   { error: "Поле 'name' обязательно", errors: [...] }
 */

export function validateBody(rules) {
  return (req, res, next) => {
    const errors = [];

    for (const [field, checks] of Object.entries(rules)) {
      const val = req.body[field];
      const isEmpty = val === undefined || val === null || val === '';

      // Обязательное поле отсутствует — дальнейшие проверки этого поля не нужны
      if (checks.required && isEmpty) {
        errors.push(`Поле "${field}" обязательно`);
        continue;
      }

      // Необязательное поле не передано — пропускаем все проверки
      if (isEmpty) continue;

      if (checks.type === 'string' && typeof val !== 'string') {
        errors.push(`Поле "${field}" должно быть строкой`);
      }
      if (checks.minLength && typeof val === 'string' && val.trim().length < checks.minLength) {
        errors.push(`Поле "${field}" слишком короткое (минимум ${checks.minLength} символов)`);
      }
      if (checks.maxLength && typeof val === 'string' && val.length > checks.maxLength) {
        errors.push(`Поле "${field}" слишком длинное (максимум ${checks.maxLength} символов)`);
      }
      if (checks.type === 'number' && isNaN(parseInt(val))) {
        errors.push(`Поле "${field}" должно быть числом`);
      }
      if (checks.min !== undefined && parseInt(val) < checks.min) {
        errors.push(`Поле "${field}" должно быть не менее ${checks.min}`);
      }
      if (checks.max !== undefined && parseInt(val) > checks.max) {
        errors.push(`Поле "${field}" должно быть не более ${checks.max}`);
      }
      if (checks.enum && !checks.enum.includes(val)) {
        errors.push(`Поле "${field}" содержит недопустимое значение`);
      }
    }

    if (errors.length > 0) return res.status(400).json({ error: errors[0], errors });
    next();
  };
}
