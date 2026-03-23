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

function renderMonthlyOverview(state) {
  const entries = {}

  const monthlyIncomeEntry = getMonthlyIncomeEntry(state)

  if (monthlyIncomeEntry) {
    const month = new Date(`${monthlyIncomeEntry.date}T12:00:00`).toLocaleDateString('pt-BR', {
      month: 'short',
    })

    entries[month] = { month, gastos: 0, entradas: monthlyIncomeEntry.amount, reserva: 0 }
  }

  state.transactions.forEach((item) => {
    const month = new Date(`${item.date}T12:00:00`).toLocaleDateString('pt-BR', {
      month: 'short',
    })

    if (!entries[month]) {
      entries[month] = { month, gastos: 0, entradas: 0, reserva: 0 }
    }

    if (item.type === 'expense') {
      entries[month].gastos += item.amount
    } else if (item.type === 'reserve') {
      entries[month].reserva += item.amount
    } else {
      entries[month].entradas += item.amount
    }
  })

  const months = Object.values(entries)

  if (!months.length) {
    return '<p class="empty-state">Os graficos aparecem assim que voce registrar movimentacoes.</p>'
  }

  const highestValue = Math.max(...months.flatMap((item) => [item.gastos, item.entradas, item.reserva]), 1)

  return `
    <div class="bars-panel">
      ${months
        .map(
          (item) => `
            <div class="month-card">
              <strong>${item.month}</strong>
              <div class="month-bars">
                <div class="month-bar-wrap">
                  <span>Entradas</span>
                  <div class="month-bar-track">
                    <div class="month-bar income-bar" style="width: ${(item.entradas / highestValue) * 100}%"></div>
                  </div>
                  <small>${formatCurrency(item.entradas)}</small>
                </div>
                <div class="month-bar-wrap">
                  <span>Gastos</span>
                  <div class="month-bar-track">
                    <div class="month-bar expense-bar" style="width: ${(item.gastos / highestValue) * 100}%"></div>
                  </div>
                  <small>${formatCurrency(item.gastos)}</small>
                </div>
                <div class="month-bar-wrap">
                  <span>Reserva</span>
                  <div class="month-bar-track">
                    <div class="month-bar reserve-bar" style="width: ${(item.reserva / highestValue) * 100}%"></div>
                  </div>
                  <small>${formatCurrency(item.reserva)}</small>
                </div>
              </div>
            </div>
          `,
        )
        .join('')}
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
                  <h2>Entradas, gastos e reserva por mes</h2>
                </div>
                ${renderMonthlyOverview(state)}
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
