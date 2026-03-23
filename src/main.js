const STORAGE_KEY = 'finance-organizer-data-v1'

const categoryOptions = [
  'Moradia',
  'Alimentacao',
  'Transporte',
  'Saude',
  'Lazer',
  'Educacao',
  'Assinaturas',
  'Outros',
]

const initialState = {
  monthlyIncome: 0,
  transactions: [],
}

let monthlyIncomeDraft = ''
let currentFormDate = getTodayIsoDate()
let calendarOpen = false
let calendarViewDate = `${currentFormDate.slice(0, 7)}-01`
let timelineViewMode = 'month'
let formDraft = {
  description: '',
  amount: '',
  category: categoryOptions[0],
  type: 'expense',
}

function getSafeStorage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function getTodayIsoDate() {
  const now = new Date()
  const timezoneOffset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10)
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0))
}

function formatDate(date) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR')
}

function formatDateForInput(date) {
  if (!date) {
    return ''
  }

  const [year, month, day] = String(date).split('-')
  if (!year || !month || !day) {
    return ''
  }

  return `${day}/${month}/${year}`
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) {
    return false
  }

  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)

  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function parseDateInput(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 8)

  if (digits.length !== 8) {
    return ''
  }

  const day = digits.slice(0, 2)
  const month = digits.slice(2, 4)
  const year = digits.slice(4, 8)
  const isoDate = `${year}-${month}-${day}`

  return isValidIsoDate(isoDate) ? isoDate : ''
}

function maskDateInput(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 8)

  if (digits.length <= 2) {
    return digits
  }

  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`
  }

  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

function createId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID()
  }

  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizeFinanceData(data) {
  if (!data || typeof data !== 'object') {
    return { ...initialState }
  }

  return {
    monthlyIncome: Number(data.monthlyIncome || 0),
    transactions: Array.isArray(data.transactions)
      ? data.transactions
          .filter((item) => item && typeof item === 'object')
          .map((item) => ({
            id: String(item.id || createId()),
            description: String(item.description || ''),
            amount: Number(item.amount || 0),
            category: String(item.category || 'Outros'),
            date: isValidIsoDate(String(item.date || '')) ? String(item.date) : getTodayIsoDate(),
            type: item.type === 'income' ? 'income' : item.type === 'reserve' ? 'reserve' : 'expense',
          }))
      : [],
  }
}

function loadState() {
  const storage = getSafeStorage()
  const saved = storage?.getItem(STORAGE_KEY)

  if (!saved) {
    return { ...initialState }
  }

  try {
    return normalizeFinanceData(JSON.parse(saved))
  } catch {
    return { ...initialState }
  }
}

function saveState(state) {
  const storage = getSafeStorage()
  storage?.setItem(STORAGE_KEY, JSON.stringify(state))
}

function parseMoneyInput(value) {
  const normalized = String(value || '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function getMonthlyIncomeEntry(state) {
  const amount = Number(state.monthlyIncome || 0)

  if (amount <= 0) {
    return null
  }

  return {
    id: 'monthly-income',
    description: 'Renda mensal principal',
    amount,
    category: 'Entradas fixas',
    date: getTodayIsoDate(),
    type: 'income',
    isFixedIncome: true,
  }
}

function getDisplayTransactions(state) {
  const monthlyIncomeEntry = getMonthlyIncomeEntry(state)
  return monthlyIncomeEntry ? [monthlyIncomeEntry, ...state.transactions] : state.transactions
}

function getSummary(state) {
  const expenses = state.transactions.filter((item) => item.type === 'expense')
  const incomes = state.transactions.filter((item) => item.type === 'income')
  const reserves = state.transactions.filter((item) => item.type === 'reserve')

  const totalExpenses = expenses.reduce((sum, item) => sum + item.amount, 0)
  const extraIncome = incomes.reduce((sum, item) => sum + item.amount, 0)
  const totalReserve = reserves.reduce((sum, item) => sum + item.amount, 0)
  const totalIncome = Number(state.monthlyIncome || 0) + extraIncome
  const balance = totalIncome - totalExpenses - totalReserve

  const categoryMap = expenses.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + item.amount
    return acc
  }, {})

  const categoryData = Object.entries(categoryMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  return {
    totalExpenses,
    totalIncome,
    totalReserve,
    balance,
    transactionCount: getDisplayTransactions(state).length,
    categoryData,
  }
}

function entryTitleForView() {
  return timelineViewMode === 'day' ? 'por dia' : 'por mes'
}

function renderCategoryList(categoryData) {
  if (!categoryData.length) {
    return '<p class="empty-state">Adicione gastos para ver a distribuicao por categoria.</p>'
  }

  const maxValue = Math.max(...categoryData.map((item) => item.value), 1)

  return `
    <div class="category-list">
      ${categoryData
        .map(
          (item, index) => `
            <div class="category-row">
              <div class="category-topline">
                <span class="category-name">
                  <i class="category-dot color-${(index % 6) + 1}"></i>
                  ${item.name}
                </span>
                <strong>${formatCurrency(item.value)}</strong>
              </div>
              <div class="category-bar">
                <div class="category-fill color-${(index % 6) + 1}" style="width: ${(item.value / maxValue) * 100}%"></div>
              </div>
            </div>
          `,
        )
        .join('')}
    </div>
  `
}

function getTransactionTypeLabel(type) {
  if (type === 'income') {
    return 'Entrada'
  }

  if (type === 'reserve') {
    return 'Reserva de emergencia'
  }

  return 'Gasto'
}

function getTransactionTypeClass(type) {
  if (type === 'income') {
    return 'positive'
  }

  if (type === 'reserve') {
    return 'reserve'
  }

  return 'negative'
}

function getTransactionSignal(type) {
  if (type === 'income') {
    return '+'
  }

  if (type === 'reserve') {
    return '*'
  }

  return '-'
}

function renderTransactions(state) {
  const transactions = getDisplayTransactions(state)

  if (!transactions.length) {
    return '<p class="empty-state">Nenhum lancamento cadastrado ainda.</p>'
  }

  return `
    <div class="transaction-list">
      ${transactions
        .map(
          (transaction) => `
            <div class="transaction-row">
              <div>
                <strong>${transaction.description}</strong>
                <span>${transaction.category} - ${formatDate(transaction.date)}</span>
              </div>
              <div class="transaction-meta">
                <strong class="${getTransactionTypeClass(transaction.type)}">
                  ${getTransactionSignal(transaction.type)}${formatCurrency(transaction.amount)}
                </strong>
                <span class="transaction-type">${getTransactionTypeLabel(transaction.type)}</span>
                ${
                  transaction.isFixedIncome
                    ? '<span class="transaction-fixed">Valor da renda mensal</span>'
                    : `<button type="button" data-remove-id="${transaction.id}">Remover</button>`
                }
              </div>
            </div>
          `,
        )
        .join('')}
    </div>
  `
}

function renderTimelineOverview(state, viewMode = 'month') {
  const entries = {}
  const getEntryKey = (date) => (viewMode === 'day' ? String(date) : String(date).slice(0, 7))
  const getEntryLabel = (date) => {
    if (viewMode === 'day') {
      return new Date(`${String(date)}T12:00:00`).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
      })
    }

    return new Date(`${String(date).slice(0, 7)}-01T12:00:00`).toLocaleDateString('pt-BR', {
      month: 'short',
    })
  }
  const monthlyIncomeEntry = getMonthlyIncomeEntry(state)

  if (monthlyIncomeEntry && viewMode === 'month') {
    const entryKey = getEntryKey(monthlyIncomeEntry.date)
    entries[entryKey] = { label: getEntryLabel(monthlyIncomeEntry.date), entryKey, gastos: 0, entradas: monthlyIncomeEntry.amount, reserva: 0 }
  }

  state.transactions.forEach((item) => {
    const entryKey = getEntryKey(item.date)

    if (!entries[entryKey]) {
      entries[entryKey] = { label: getEntryLabel(item.date), entryKey, gastos: 0, entradas: 0, reserva: 0 }
    }

    if (item.type === 'expense') {
      entries[entryKey].gastos += item.amount
    } else if (item.type === 'reserve') {
      entries[entryKey].reserva += item.amount
    } else {
      entries[entryKey].entradas += item.amount
    }
  })

  const timelineItems = Object.values(entries).sort((a, b) => a.entryKey.localeCompare(b.entryKey))

  if (!timelineItems.length) {
    return '<p class="empty-state">Os graficos aparecem assim que voce registrar movimentacoes.</p>'
  }

  const chartHeight = 220
  const chartWidth = 560
  const paddingTop = 20
  const paddingRight = 22
  const paddingBottom = 42
  const paddingLeft = 18
  const maxValue = Math.max(...timelineItems.flatMap((item) => [item.gastos, item.entradas, item.reserva]), 1)
  const chartMaxValue = maxValue * 1.12
  const innerWidth = chartWidth - paddingLeft - paddingRight
  const innerHeight = chartHeight - paddingTop - paddingBottom
  const plotTop = paddingTop + 4
  const plotBottom = paddingTop + innerHeight - 10
  const plotHeight = plotBottom - plotTop
  const stepX = timelineItems.length > 1 ? innerWidth / (timelineItems.length - 1) : 0
  const yForValue = (value) => plotBottom - (value / chartMaxValue) * plotHeight
  const xForIndex = (index) => paddingLeft + stepX * index
  const gridValues = Array.from({ length: 4 }, (_, index) => Math.round((chartMaxValue / 3) * index))
  const axisLabelStep = viewMode === 'day' && timelineItems.length > 8 ? Math.ceil(timelineItems.length / 6) : 1
  const series = [
    { key: 'entradas', label: 'Entradas', className: 'income-line', gradientId: 'timelineStrokeIncome' },
    { key: 'gastos', label: 'Gastos', className: 'expense-line', gradientId: 'timelineStrokeExpense' },
    { key: 'reserva', label: 'Reserva', className: 'reserve-line', gradientId: 'timelineStrokeReserve' },
  ]
  const chartPoints = (key) =>
    timelineItems.map((item, index) => ({
      x: xForIndex(index),
      y: yForValue(item[key]),
    }))

  const buildSmoothPath = (points) => {
    if (!points.length) {
      return ''
    }

    if (points.length === 1) {
      return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`
    }

    if (points.length === 2) {
      return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)} Q ${((points[0].x + points[1].x) / 2).toFixed(2)} ${points[0].y.toFixed(2)} ${points[1].x.toFixed(2)} ${points[1].y.toFixed(2)}`
    }

    const line = (pointA, pointB) => ({
      length: Math.hypot(pointB.x - pointA.x, pointB.y - pointA.y),
      angle: Math.atan2(pointB.y - pointA.y, pointB.x - pointA.x),
    })
    const controlPoint = (current, previous, next, reverse = false) => {
      const previousPoint = previous || current
      const nextPoint = next || current
      const smoothing = 0.18
      const segment = line(previousPoint, nextPoint)
      const angle = segment.angle + (reverse ? Math.PI : 0)
      const length = segment.length * smoothing

      return {
        x: current.x + Math.cos(angle) * length,
        y: current.y + Math.sin(angle) * length,
      }
    }

    let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`

    for (let index = 0; index < points.length - 1; index += 1) {
      const current = points[index]
      const next = points[index + 1]
      const cps = controlPoint(current, points[index - 1], next)
      const cpe = controlPoint(next, current, points[index + 2], true)

      path += ` C ${cps.x.toFixed(2)} ${cps.y.toFixed(2)}, ${cpe.x.toFixed(2)} ${cpe.y.toFixed(2)}, ${next.x.toFixed(2)} ${next.y.toFixed(2)}`
    }

    return path
  }

  return `
    <div class="timeline-panel">
      <div class="timeline-legend">
        ${series
          .map(
            (item) => `
              <span class="timeline-legend-item">
                <i class="timeline-swatch ${item.className}"></i>
                ${item.label}
              </span>
            `,
          )
          .join('')}
      </div>

      <div class="timeline-chart-wrap">
        <svg class="timeline-chart" viewBox="0 0 ${chartWidth} ${chartHeight}" role="img" aria-label="Grafico de linha com entradas, gastos e reserva ${viewMode === 'day' ? 'por dia' : 'por mes'}">
          <defs>
            <linearGradient id="timelineStrokeIncome" gradientUnits="userSpaceOnUse" x1="${paddingLeft}" y1="${plotTop}" x2="${chartWidth - paddingRight}" y2="${plotBottom}">
              <stop offset="0%" stop-color="#1dd4bf"></stop>
              <stop offset="45%" stop-color="#34d399"></stop>
              <stop offset="100%" stop-color="#8bffcf"></stop>
            </linearGradient>
            <linearGradient id="timelineStrokeExpense" gradientUnits="userSpaceOnUse" x1="${paddingLeft}" y1="${plotTop}" x2="${chartWidth - paddingRight}" y2="${plotBottom}">
              <stop offset="0%" stop-color="#ff8757"></stop>
              <stop offset="50%" stop-color="#fb7185"></stop>
              <stop offset="100%" stop-color="#ffc0cb"></stop>
            </linearGradient>
            <linearGradient id="timelineStrokeReserve" gradientUnits="userSpaceOnUse" x1="${paddingLeft}" y1="${plotTop}" x2="${chartWidth - paddingRight}" y2="${plotBottom}">
              <stop offset="0%" stop-color="#38bdf8"></stop>
              <stop offset="50%" stop-color="#60a5fa"></stop>
              <stop offset="100%" stop-color="#93c5fd"></stop>
            </linearGradient>
          </defs>

          ${gridValues
            .map(
              (value) => `
                <g>
                  <line class="timeline-grid-line" x1="${paddingLeft}" y1="${yForValue(value)}" x2="${chartWidth - paddingRight}" y2="${yForValue(value)}"></line>
                  <text class="timeline-grid-label" x="${chartWidth - paddingRight}" y="${yForValue(value) - 6}" text-anchor="end">${formatCurrency(value)}</text>
                </g>
              `,
            )
            .join('')}

          ${series
            .map(
              (item) => `
                <path class="timeline-path ${item.className}" d="${buildSmoothPath(chartPoints(item.key))}" stroke="url(#${item.gradientId})"></path>
                ${timelineItems
                  .map(
                    (timelineItem, index) => `
                      <circle class="timeline-point ${item.className}" cx="${xForIndex(index)}" cy="${yForValue(timelineItem[item.key])}" r="4.5"></circle>
                    `,
                  )
                  .join('')}
              `,
            )
            .join('')}

          ${timelineItems
            .map(
              (item, index) => `
                <text class="timeline-axis-label" x="${xForIndex(index)}" y="${chartHeight - 10}" text-anchor="middle">${index % axisLabelStep === 0 || index === timelineItems.length - 1 ? item.label : ''}</text>
              `,
            )
            .join('')}
        </svg>
      </div>

      <div class="timeline-summary">
        ${timelineItems
          .map(
            (item) => `
              <div class="timeline-summary-card">
                <strong>${item.label}</strong>
                <span>Entradas: ${formatCurrency(item.entradas)}</span>
                <span>Gastos: ${formatCurrency(item.gastos)}</span>
                <span>Reserva: ${formatCurrency(item.reserva)}</span>
              </div>
            `,
          )
          .join('')}
      </div>
    </div>
  `
}

function addMonthsToIsoMonth(isoMonthDate, amount) {
  const [year, month] = isoMonthDate.split('-').map(Number)
  const date = new Date(year, month - 1 + amount, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
}

function buildCalendarDays(viewMonthDate, selectedDate) {
  const [year, month] = viewMonthDate.split('-').map(Number)
  const firstDay = new Date(year, month - 1, 1)
  const startWeekday = (firstDay.getDay() + 6) % 7

  return Array.from({ length: 42 }, (_, index) => {
    const currentDate = new Date(year, month - 1, index - startWeekday + 1)
    const isoDate = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`
    const isCurrentMonth = currentDate.getMonth() === month - 1

    return {
      isoDate,
      label: currentDate.getDate(),
      isCurrentMonth,
      isSelected: isoDate === selectedDate,
      isToday: isoDate === getTodayIsoDate(),
    }
  })
}

function renderCalendar(selectedDate) {
  const safeSelectedDate = isValidIsoDate(selectedDate) ? selectedDate : getTodayIsoDate()
  const safeViewDate = isValidIsoDate(calendarViewDate) ? calendarViewDate : `${safeSelectedDate.slice(0, 7)}-01`
  const monthLabel = new Date(`${safeViewDate}T12:00:00`).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  })
  const weekdays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom']
  const days = buildCalendarDays(safeViewDate, safeSelectedDate)

  return `
    <div class="calendar-popover ${calendarOpen ? 'is-open' : ''}">
      <div class="calendar-header">
        <button type="button" class="calendar-nav" data-calendar-nav="-1" aria-label="Mes anterior">&lt;</button>
        <strong>${monthLabel}</strong>
        <button type="button" class="calendar-nav" data-calendar-nav="1" aria-label="Proximo mes">&gt;</button>
      </div>
      <div class="calendar-weekdays">
        ${weekdays.map((weekday) => `<span>${weekday}</span>`).join('')}
      </div>
      <div class="calendar-grid">
        ${days
          .map(
            (day) => `
              <button
                type="button"
                class="calendar-day ${day.isCurrentMonth ? '' : 'is-muted'} ${day.isSelected ? 'is-selected' : ''} ${day.isToday ? 'is-today' : ''}"
                data-calendar-date="${day.isoDate}"
              >
                ${day.label}
              </button>
            `,
          )
          .join('')}
      </div>
    </div>
  `
}

function createAppMarkup(state) {
  const summary = getSummary(state)
  const incomeValue = monthlyIncomeDraft === '' ? String(state.monthlyIncome || '') : monthlyIncomeDraft
  const selectedDate = isValidIsoDate(currentFormDate) ? currentFormDate : getTodayIsoDate()

  return `
    <div class="page-shell">
      <div class="aurora aurora-left"></div>
      <div class="aurora aurora-right"></div>

      <main class="app-layout">
        <section class="hero-card">
          <div class="hero-copy">
            <p class="eyebrow">Planejamento financeiro pessoal</p>
            <h1>Veja para onde seu dinheiro esta indo e quanto sobra no fim do mes.</h1>
            <p class="hero-text">
              Cadastre sua renda fixa, registre cada gasto e acompanhe os totais em um dashboard simples,
              visual e pronto para uso no dia a dia.
            </p>
          </div>

          <div class="income-panel">
            <label for="monthlyIncome">Renda mensal principal</label>
            <input id="monthlyIncome" type="text" inputmode="decimal" placeholder="Ex.: 3500,00" value="${incomeValue}" />
            <strong>${formatCurrency(state.monthlyIncome)}</strong>
            <span>Esse valor entra no calculo do saldo restante.</span>
          </div>
        </section>

        <section class="content-grid">
          <form class="entry-card" id="transactionForm">
            <div class="section-heading">
              <p class="eyebrow">Novo lancamento</p>
              <h2>Cadastrar gasto ou entrada</h2>
            </div>

            <div class="input-grid">
              <label>
                Descricao
                <input type="text" name="description" placeholder="Ex.: supermercado, salario, gasolina" value="${formDraft.description}" required />
              </label>

              <label>
                Valor
                <input type="number" name="amount" min="0" step="0.01" placeholder="0,00" value="${formDraft.amount}" required />
              </label>

              <label>
                Categoria
                <select name="category">
                  ${categoryOptions
                    .map(
                      (category) =>
                        `<option value="${category}" ${formDraft.category === category ? 'selected' : ''}>${category}</option>`,
                    )
                    .join('')}
                </select>
              </label>

              <label>
                Data
                <div class="date-field">
                  <input type="text" name="date" inputmode="numeric" placeholder="dd/mm/aaaa" value="${formatDateForInput(selectedDate)}" required />
                  <button class="date-picker-button" type="button" aria-label="Abrir calendario">📅</button>
                  ${renderCalendar(selectedDate)}
                </div>
              </label>

              <label>
                Tipo
                <select name="type">
                  <option value="expense" ${formDraft.type === 'expense' ? 'selected' : ''}>Gasto</option>
                  <option value="income" ${formDraft.type === 'income' ? 'selected' : ''}>Entrada</option>
                  <option value="reserve" ${formDraft.type === 'reserve' ? 'selected' : ''}>Reserva de emergencia</option>
                </select>
              </label>
            </div>

            <button class="primary-button" type="submit">Salvar lancamento</button>
          </form>

          <section class="dashboard-grid">
            <div class="stats-grid">
              <article class="stat-card">
                <span>Total gasto</span>
                <strong>${formatCurrency(summary.totalExpenses)}</strong>
              </article>
              <article class="stat-card">
                <span>Total de entradas</span>
                <strong>${formatCurrency(summary.totalIncome)}</strong>
              </article>
              <article class="stat-card">
                <span>Reserva de emergencia</span>
                <strong class="reserve">${formatCurrency(summary.totalReserve)}</strong>
              </article>
              <article class="stat-card">
                <span>Saldo restante</span>
                <strong class="${summary.balance < 0 ? 'negative' : 'positive'}">${formatCurrency(summary.balance)}</strong>
              </article>
              <article class="stat-card">
                <span>Lancamentos</span>
                <strong>${summary.transactionCount}</strong>
              </article>
            </div>

            <div class="charts-grid">
              <article class="panel-card chart-card">
                <div class="section-heading compact">
                  <p class="eyebrow">Categorias</p>
                  <h2>Onde voce mais gasta</h2>
                </div>
                ${renderCategoryList(summary.categoryData)}
              </article>

              <article class="panel-card chart-card">
                <div class="section-heading compact">
                  <p class="eyebrow">Linha do tempo</p>
                  <div class="timeline-header-row">
                    <h2>Entradas, gastos e reserva ${entryTitleForView()}</h2>
                    <div class="view-toggle" role="tablist" aria-label="Alternar visualizacao do grafico">
                      <button type="button" class="view-toggle-button ${timelineViewMode === 'day' ? 'is-active' : ''}" data-timeline-view="day">Dia</button>
                      <button type="button" class="view-toggle-button ${timelineViewMode === 'month' ? 'is-active' : ''}" data-timeline-view="month">Mes</button>
                    </div>
                  </div>
                </div>
                ${renderTimelineOverview(state, timelineViewMode)}
              </article>
            </div>

            <article class="panel-card list-card">
              <div class="section-heading compact">
                <p class="eyebrow">Historico</p>
                <h2>Ultimos lancamentos</h2>
              </div>
              ${renderTransactions(state)}
            </article>
          </section>
        </section>
      </main>
    </div>
  `
}

let financeState = loadState()
monthlyIncomeDraft = financeState.monthlyIncome ? String(financeState.monthlyIncome).replace('.', ',') : ''

function renderApp() {
  const root = document.getElementById('root')
  root.innerHTML = createAppMarkup(financeState)

  const monthlyIncomeInput = document.getElementById('monthlyIncome')
  monthlyIncomeInput.addEventListener('input', (event) => {
    monthlyIncomeDraft = event.target.value
  })
  monthlyIncomeInput.addEventListener('blur', (event) => {
    const parsedValue = parseMoneyInput(event.target.value)
    financeState = {
      ...financeState,
      monthlyIncome: parsedValue,
    }
    monthlyIncomeDraft = parsedValue ? parsedValue.toFixed(2).replace('.', ',') : ''
    saveState(financeState)
    renderApp()
  })

  const form = document.getElementById('transactionForm')
  const dateField = form.querySelector('.date-field')
  const dateInput = form.querySelector('input[name="date"]')
  const calendarButton = form.querySelector('.date-picker-button')

  form.querySelector('input[name="description"]').addEventListener('input', (event) => {
    formDraft.description = event.target.value
  })

  form.querySelector('input[name="amount"]').addEventListener('input', (event) => {
    formDraft.amount = event.target.value
  })

  form.querySelector('select[name="category"]').addEventListener('change', (event) => {
    formDraft.category = event.target.value
  })

  form.querySelector('select[name="type"]').addEventListener('change', (event) => {
    formDraft.type = event.target.value
  })

  document.querySelectorAll('[data-timeline-view]').forEach((button) => {
    button.addEventListener('click', () => {
      timelineViewMode = button.dataset.timelineView === 'day' ? 'day' : 'month'
      renderApp()
    })
  })

  dateInput.addEventListener('input', (event) => {
    event.target.value = maskDateInput(event.target.value)
    const parsedTypedDate = parseDateInput(event.target.value)
    if (parsedTypedDate) {
      currentFormDate = parsedTypedDate
      calendarViewDate = `${parsedTypedDate.slice(0, 7)}-01`
      calendarOpen = true
      renderApp()
    }
  })

  dateInput.addEventListener('focus', () => {
    calendarOpen = true
    renderApp()
  })

  calendarButton.addEventListener('click', () => {
    calendarOpen = !calendarOpen
    renderApp()
  })

  dateField.querySelectorAll('[data-calendar-nav]').forEach((button) => {
    button.addEventListener('click', () => {
      calendarViewDate = addMonthsToIsoMonth(calendarViewDate, Number(button.dataset.calendarNav || 0))
      calendarOpen = true
      renderApp()
    })
  })

  dateField.querySelectorAll('[data-calendar-date]').forEach((button) => {
    button.addEventListener('click', () => {
      currentFormDate = button.dataset.calendarDate
      calendarViewDate = `${currentFormDate.slice(0, 7)}-01`
      calendarOpen = false
      renderApp()
    })
  })

  document.addEventListener(
    'click',
    (event) => {
      if (!event.target.closest('.date-field')) {
        if (calendarOpen) {
          calendarOpen = false
          renderApp()
        }
      }
    },
    { once: true },
  )

  form.addEventListener('submit', (event) => {
    event.preventDefault()

    const formData = new FormData(form)
    const description = String(formData.get('description') || '').trim()
    const amount = Number(formData.get('amount') || 0)
    const parsedDate = parseDateInput(formData.get('date'))

    if (!description || amount <= 0 || !parsedDate) {
      return
    }

    const transaction = {
      id: createId(),
      description,
      amount,
      category: String(formData.get('category') || 'Outros'),
      date: parsedDate,
      type:
        formData.get('type') === 'income'
          ? 'income'
          : formData.get('type') === 'reserve'
            ? 'reserve'
            : 'expense',
    }

    financeState = {
      ...financeState,
      transactions: [transaction, ...financeState.transactions],
    }

    formDraft = {
      description: '',
      amount: '',
      category: categoryOptions[0],
      type: 'expense',
    }
    currentFormDate = getTodayIsoDate()
    calendarViewDate = `${currentFormDate.slice(0, 7)}-01`
    calendarOpen = false

    saveState(financeState)
    renderApp()
  })

  root.querySelectorAll('[data-remove-id]').forEach((button) => {
    button.addEventListener('click', () => {
      financeState = {
        ...financeState,
        transactions: financeState.transactions.filter((item) => item.id !== button.dataset.removeId),
      }
      saveState(financeState)
      renderApp()
    })
  })
}

renderApp()
