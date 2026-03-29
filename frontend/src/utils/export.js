/**
 * Export utilities: PDF and Excel for ТО reports
 */

// ─── Excel ───────────────────────────────────────────────────────────────────
export async function exportToExcel(tasks, year, month) {
  const XLSX = await import('xlsx');
  const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const STATUS_RU = { pending: 'Ожидает', in_progress: 'В процессе', completed: 'Выполнено', overdue: 'Просрочено' };

  const rows = [];
  tasks.forEach(t => {
    const entrances = t.building?.entrances || [];
    const allComps = t.completions || [];
    const done = allComps.filter(c => c.is_completed).length;
    const total = allComps.length;
    const users = [...new Set(allComps.filter(c => c.user_name).map(c => c.user_name))].join(', ');
    // Основная строка
    rows.push({
      'Объект': t.building?.name || '',
      'Адрес': t.building?.address || '',
      'День ТО': t.building?.due_day || '',
      'Статус': STATUS_RU[t.status] || t.status,
      'Выполнено': `${done}/${total}`,
      'Исполнители': users,
      'Подъезд / Лифт': '',
      'Статус детали': '',
    });
    // Строки детализации по подъездам и лифтам
    entrances.forEach(entrance => {
      if (entrance.elevators?.length > 1) {
        entrance.elevators.forEach(el => {
          const c = allComps.find(x => x.completion_type === 'elevator' && x.elevator_id === el.id);
          rows.push({ 'Объект': '', 'Адрес': '', 'День ТО': '', 'Статус': '', 'Выполнено': '', 'Исполнители': c?.user_name || '',
            'Подъезд / Лифт': `  ${entrance.name} — ${el.name}`, 'Статус детали': c?.is_completed ? '✓' : '—' });
        });
      } else {
        const c = allComps.find(x => x.completion_type === 'entrance' && x.entrance_id === entrance.id);
        rows.push({ 'Объект': '', 'Адрес': '', 'День ТО': '', 'Статус': '', 'Выполнено': '', 'Исполнители': c?.user_name || '',
          'Подъезд / Лифт': `  ${entrance.name}`, 'Статус детали': c?.is_completed ? '✓' : '—' });
      }
    });
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  // Ширина столбцов
  ws['!cols'] = [{ wch: 30 }, { wch: 35 }, { wch: 10 }, { wch: 15 }, { wch: 14 }, { wch: 25 }, { wch: 28 }, { wch: 14 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `ТО ${MONTHS[month - 1]} ${year}`);
  XLSX.writeFile(wb, `ТО_${year}_${String(month).padStart(2, '0')}.xlsx`);
}

// ─── PDF ────────────────────────────────────────────────────────────────────
export async function exportToPDF(tasks, year, month) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const STATUS_RU = { pending: 'Ожидает', in_progress: 'В процессе', completed: 'Выполнено', overdue: 'Просрочено' };
  const STATUS_COLORS = {
    completed:  [34, 197, 94],
    in_progress:[234, 179, 8],
    overdue:    [239, 68, 68],
    pending:    [148, 163, 184],
  };

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // Заголовок
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`Отчёт ТО лифтов — ${MONTHS[month - 1]} ${year}`, 14, 16);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120);
  doc.text(`Сформировано: ${new Date().toLocaleString('ru')}`, 14, 22);
  doc.setTextColor(0);

  // Итоговая строка
  const total     = tasks.length;
  const completed = tasks.filter(t => t.status === 'completed').length;
  const overdue   = tasks.filter(t => t.status === 'overdue').length;
  const inProg    = tasks.filter(t => t.status === 'in_progress').length;

  doc.setFontSize(10);
  doc.text(`Всего: ${total}   Выполнено: ${completed}   В процессе: ${inProg}   Просрочено: ${overdue}`, 14, 28);

  // Таблица данных
  const pdfRows = [];
  tasks.forEach(t => {
    const allComps = t.completions || [];
    const done = allComps.filter(c => c.is_completed).length;
    const tot  = allComps.length;
    const users = [...new Set(allComps.filter(c => c.user_name).map(c => c.user_name))].join(', ');
    pdfRows.push([t.building?.name||'', t.building?.address||'', t.building?.due_day||'',
      STATUS_RU[t.status]||t.status, `${done}/${tot}`, users||'—']);
    // Детализация по подъездам
    const entrances = t.building?.entrances || [];
    entrances.forEach(entrance => {
      if (entrance.elevators?.length > 1) {
        entrance.elevators.forEach(el => {
          const c = allComps.find(x => x.completion_type === 'elevator' && x.elevator_id === el.id);
          pdfRows.push(['', `  ${entrance.name} — ${el.name}`, '', '', c?.is_completed ? '✓' : '—', c?.user_name||'']);
        });
      } else {
        const c = allComps.find(x => x.completion_type === 'entrance' && x.entrance_id === entrance.id);
        pdfRows.push(['', `  ${entrance.name}`, '', '', c?.is_completed ? '✓' : '—', c?.user_name||'']);
      }
    });
  });
  const rows = pdfRows;

  autoTable(doc, {
    startY: 33,
    head: [['Объект', 'Адрес', 'День ТО', 'Статус', 'Выполнено', 'Исполнители']],
    body: rows,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 55 },
      1: { cellWidth: 65 },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 28, halign: 'center' },
      4: { cellWidth: 22, halign: 'center' },
      5: { cellWidth: 60 },
    },
    didDrawCell: (data) => {
      if (data.column.index === 3 && data.section === 'body') {
        const status = Object.keys(STATUS_RU).find(k => STATUS_RU[k] === data.cell.text[0]);
        if (status) {
          const [r, g, b] = STATUS_COLORS[status] || [0, 0, 0];
          data.doc.setTextColor(r, g, b);
          data.doc.setFont('helvetica', 'bold');
        }
      }
    },
    didParseCell: (data) => {
      if (data.column.index === 3 && data.section === 'body') {
        data.cell.styles.textColor = [0, 0, 0];
      }
    },
    alternateRowStyles: { fillColor: [248, 249, 250] },
  });

  doc.save(`ТО_${year}_${String(month).padStart(2, '0')}.pdf`);
}
