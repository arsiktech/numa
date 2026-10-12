import type { CurrencyCode } from "@/lib/types";

/**
 * Localized copy for the shared-pot expense sheet, extracted from
 * `src/routes/pod/page.tsx`. Keyed by AppLocale; the sheet resolves one locale
 * bundle and passes it down so render code never touches the dictionary
 * directly.
 */

export type ExpenseScenario =
  | "shared_groups"
  | "covered_group"
  | "selected_people"
  | "custom_split";

export const POD_EXPENSE_COPY = {
  en: {
    addTitle: "Add shared expense",
    editTitle: "Edit expense",
    smartAdd: "Smart add",
    amount: "Amount",
    description: "Description",
    descriptionPlaceholder: "What was it?",
    category: "Category",
    uncategorized: "Uncategorized",
    categoryHint: "Numa Pro guesses from the description. You can override it.",
    item: (index: number) => `Item ${index}`,
    batchDescription: (count: number) => `${count} expenses`,
    presetCoffee: "Coffee",
    presetGroceries: "Groceries",
    presetTaxi: "Taxi",
    presetDinner: "Dinner",
    addAmount: "Add amount",
    saveExpense: "Save expense",
    saveExpenses: (count: number) => `Save ${count} expenses`,
    saving: "Saving...",
    delete: "Delete",
    deleteExpense: "Delete expense",
    cancel: "Cancel",
    deleteConfirmTitle: (description: string) => `Delete "${description}"?`,
    deleteConfirmDetail: "This removes it from the pot and updates everyone's balance.",
    errorPositiveAmount: "Enter a positive amount.",
    errorDescription: "Add what this expense was for.",
    errorSmartItems: "Each smart add item needs a name and amount.",
    errorPayer: "Choose who paid.",
    errorParticipants: "Choose at least one participant.",
    errorSave: "Could not save this expense.",
    errorDelete: "Could not delete this expense.",
    detailsTitle: "Split, payer and card",
    hideOptions: "Hide options",
    tapToAdjust: "Tap to adjust",
    choosePayer: "Choose payer",
    chooseGroup: "Choose group",
    expenseType: "What kind of expense is this?",
    sharedGroupsTitle: "Shared by pairs",
    sharedGroupsDetail: (count: number) => `Split equally across ${count} groups`,
    coveredGroupTitle: "Paid for a pair",
    coveredGroupDetail: "One group used it, another may have paid",
    selectedPeopleTitle: "Pick people",
    selectedPeopleDetail: "Manual split between selected people",
    whoUsedIt: "Who was it for?",
    coveredHint: (group: string, members: string) => `${group}: ${members}`,
    coveredEmpty: "Choose a group with members before saving.",
    participants: "Participants",
    all: "All",
    onlyPayer: "Only payer",
    paidBy: "Paid by",
    card: "Card",
    cash: "Cash",
    cashOrCard: "Cash or card label",
    readyToSave: "Ready to save",
    addDescription: "Add a description",
    groupCount: (count: number) => `${count} group${count === 1 ? "" : "s"}`,
    participantCount: (count: number) => `${count} participant${count === 1 ? "" : "s"}`,
    effectSharedTitle: "Shared expense",
    effectSharedDetail: (amount: string, count: number) =>
      `${amount} will be split equally between ${count} groups. Whoever paid gets reimbursed through the final balance.`,
    effectCoveredTitle: (group?: string) => `Personal to ${group ?? "one group"}`,
    effectCoveredDetail: (
      amount: string,
      payer?: string,
      payerGroup?: string,
      coveredGroup?: string
    ) =>
      payerGroup && coveredGroup && payerGroup !== coveredGroup
        ? `${payer ?? "The payer"} paid ${amount} for ${coveredGroup}. ${coveredGroup} will owe ${payerGroup}.`
        : `${amount} is counted only for ${coveredGroup ?? "the selected group"}.`,
    effectPeopleTitle: "Custom people split",
    effectPeopleDetail: (amount: string, count: number) =>
      `${amount} will be split between ${count} selected participant${count === 1 ? "" : "s"}.`,
    customSplitTitle: "Custom %",
    customSplitDetail: "Set each person's exact share",
    customShares: "Shares",
    customEven: "Split evenly",
    customRemaining: (pct: number) => `${pct}% left to assign`,
    customOver: (pct: number) => `${pct}% over 100`,
    customComplete: "Adds up to 100%",
    errorCustomSum: "Shares must add up to exactly 100%.",
    customSummary: (count: number) => `custom % · ${count} ${count === 1 ? "person" : "people"}`,
    effectCustomTitle: "Custom split",
    effectCustomDetail: (amount: string, count: number) =>
      `${amount} splits by the exact percentages you set across ${count} ${count === 1 ? "person" : "people"}.`
  },
  ru: {
    addTitle: "Добавить общий расход",
    editTitle: "Изменить расход",
    smartAdd: "Умный ввод",
    amount: "Сумма",
    description: "Описание",
    descriptionPlaceholder: "Что это было?",
    category: "Категория",
    uncategorized: "Без категории",
    categoryHint: "Numa Pro угадывает категорию по описанию. Можно изменить вручную.",
    item: (index: number) => `Позиция ${index}`,
    batchDescription: (count: number) => `${count} расхода`,
    presetCoffee: "Кофе",
    presetGroceries: "Продукты",
    presetTaxi: "Такси",
    presetDinner: "Ужин",
    addAmount: "Добавьте сумму",
    saveExpense: "Сохранить расход",
    saveExpenses: (count: number) => `Сохранить расходы: ${count}`,
    saving: "Сохраняем...",
    delete: "Удалить",
    deleteExpense: "Удалить расход",
    cancel: "Отмена",
    deleteConfirmTitle: (description: string) => `Удалить «${description}»?`,
    deleteConfirmDetail: "Это удалит расход из пота и пересчитает баланс всех участников.",
    errorPositiveAmount: "Введите положительную сумму.",
    errorDescription: "Добавьте, за что был этот расход.",
    errorSmartItems: "В каждой позиции умного ввода нужны название и сумма.",
    errorPayer: "Выберите, кто платил.",
    errorParticipants: "Выберите хотя бы одного участника.",
    errorSave: "Не удалось сохранить расход.",
    errorDelete: "Не удалось удалить расход.",
    detailsTitle: "Кто платил и как делим",
    hideOptions: "Скрыть настройки",
    tapToAdjust: "Нажмите, чтобы настроить",
    choosePayer: "Выберите плательщика",
    chooseGroup: "Выберите пару",
    expenseType: "Что это за расход?",
    sharedGroupsTitle: "Общий на пары",
    sharedGroupsDetail: (count: number) => `Поровну между ${count} группами`,
    coveredGroupTitle: "Оплатили за пару",
    coveredGroupDetail: "Расход личный, но платила другая сторона",
    selectedPeopleTitle: "Выбрать людей",
    selectedPeopleDetail: "Ручное деление между участниками",
    whoUsedIt: "Для кого был расход?",
    coveredHint: (group: string, members: string) => `${group}: ${members}`,
    coveredEmpty: "Выберите группу с участниками перед сохранением.",
    participants: "Участники",
    all: "Все",
    onlyPayer: "Только плательщик",
    paidBy: "Кто платил",
    card: "Карта / способ",
    cash: "Наличные",
    cashOrCard: "Наличные или название карты",
    readyToSave: "Перед сохранением",
    addDescription: "Добавьте описание",
    groupCount: (count: number) => `${count} групп${count === 1 ? "а" : "ы"}`,
    participantCount: (count: number) => `${count} участник${count === 1 ? "" : "а"}`,
    effectSharedTitle: "Общий расход",
    effectSharedDetail: (amount: string, count: number) =>
      `${amount} делится поровну между ${count} группами. Кто оплатил, получит компенсацию через итоговый баланс.`,
    effectCoveredTitle: (group?: string) => `Личный расход: ${group ?? "выбранная пара"}`,
    effectCoveredDetail: (
      amount: string,
      payer?: string,
      payerGroup?: string,
      coveredGroup?: string
    ) =>
      payerGroup && coveredGroup && payerGroup !== coveredGroup
        ? `${payer ?? "Плательщик"} оплатил ${amount} за ${coveredGroup}. ${coveredGroup} будет должна ${payerGroup}.`
        : `${amount} учитывается только на ${coveredGroup ?? "выбранную группу"}.`,
    effectPeopleTitle: "Ручное деление",
    effectPeopleDetail: (amount: string, count: number) =>
      `${amount} делится между выбранными участниками: ${count}.`,
    customSplitTitle: "Свои доли %",
    customSplitDetail: "Задайте точную долю каждому",
    customShares: "Доли",
    customEven: "Поровну",
    customRemaining: (pct: number) => `Осталось распределить: ${pct}%`,
    customOver: (pct: number) => `Перебор: ${pct}% сверх 100`,
    customComplete: "В сумме ровно 100%",
    errorCustomSum: "Доли должны в сумме давать ровно 100%.",
    customSummary: (count: number) => `свои доли · ${count} чел.`,
    effectCustomTitle: "Деление по долям",
    effectCustomDetail: (amount: string, count: number) =>
      `${amount} делится по заданным процентам между участниками (${count}).`
  },
  es: {
    addTitle: "Añadir gasto compartido",
    editTitle: "Editar gasto",
    smartAdd: "Entrada inteligente",
    amount: "Importe",
    description: "Descripción",
    descriptionPlaceholder: "¿Qué fue?",
    category: "Categoría",
    uncategorized: "Sin categoría",
    categoryHint: "Numa Pro adivina la categoría por la descripción. Puedes cambiarla.",
    item: (index: number) => `Elemento ${index}`,
    batchDescription: (count: number) => `${count} gastos`,
    presetCoffee: "Café",
    presetGroceries: "Supermercado",
    presetTaxi: "Taxi",
    presetDinner: "Cena",
    addAmount: "Añade importe",
    saveExpense: "Guardar gasto",
    saveExpenses: (count: number) => `Guardar ${count} gastos`,
    saving: "Guardando...",
    delete: "Eliminar",
    deleteExpense: "Eliminar gasto",
    cancel: "Cancelar",
    deleteConfirmTitle: (description: string) => `¿Eliminar "${description}"?`,
    deleteConfirmDetail: "Esto elimina el gasto del bote y actualiza el balance de todos.",
    errorPositiveAmount: "Introduce un importe positivo.",
    errorDescription: "Añade para qué fue este gasto.",
    errorSmartItems: "Cada elemento inteligente necesita nombre e importe.",
    errorPayer: "Elige quién pagó.",
    errorParticipants: "Elige al menos un participante.",
    errorSave: "No se pudo guardar este gasto.",
    errorDelete: "No se pudo eliminar este gasto.",
    detailsTitle: "División, pagador y tarjeta",
    hideOptions: "Ocultar opciones",
    tapToAdjust: "Toca para ajustar",
    choosePayer: "Elige pagador",
    chooseGroup: "Elige grupo",
    expenseType: "¿Qué tipo de gasto es?",
    sharedGroupsTitle: "Compartido por grupos",
    sharedGroupsDetail: (count: number) => `A partes iguales entre ${count} grupos`,
    coveredGroupTitle: "Pagado por un grupo",
    coveredGroupDetail: "Un grupo lo usó, otro pudo pagarlo",
    selectedPeopleTitle: "Elegir personas",
    selectedPeopleDetail: "División manual entre personas",
    whoUsedIt: "¿Para quién fue?",
    coveredHint: (group: string, members: string) => `${group}: ${members}`,
    coveredEmpty: "Elige un grupo con miembros antes de guardar.",
    participants: "Participantes",
    all: "Todos",
    onlyPayer: "Solo pagador",
    paidBy: "Pagado por",
    card: "Tarjeta",
    cash: "Efectivo",
    cashOrCard: "Efectivo o etiqueta de tarjeta",
    readyToSave: "Listo para guardar",
    addDescription: "Añade una descripción",
    groupCount: (count: number) => `${count} grupo${count === 1 ? "" : "s"}`,
    participantCount: (count: number) => `${count} participante${count === 1 ? "" : "s"}`,
    effectSharedTitle: "Gasto compartido",
    effectSharedDetail: (amount: string, count: number) =>
      `${amount} se dividirá por igual entre ${count} grupos. Quien pagó queda compensado en el balance final.`,
    effectCoveredTitle: (group?: string) => `Personal de ${group ?? "un grupo"}`,
    effectCoveredDetail: (
      amount: string,
      payer?: string,
      payerGroup?: string,
      coveredGroup?: string
    ) =>
      payerGroup && coveredGroup && payerGroup !== coveredGroup
        ? `${payer ?? "Quien pagó"} pagó ${amount} por ${coveredGroup}. ${coveredGroup} deberá a ${payerGroup}.`
        : `${amount} cuenta solo para ${coveredGroup ?? "el grupo seleccionado"}.`,
    effectPeopleTitle: "División manual",
    effectPeopleDetail: (amount: string, count: number) =>
      `${amount} se dividirá entre ${count} participante${count === 1 ? "" : "s"}.`,
    customSplitTitle: "Porcentajes",
    customSplitDetail: "Define la parte exacta de cada uno",
    customShares: "Partes",
    customEven: "A partes iguales",
    customRemaining: (pct: number) => `Queda ${pct}% por asignar`,
    customOver: (pct: number) => `${pct}% por encima de 100`,
    customComplete: "Suma exactamente 100%",
    errorCustomSum: "Las partes deben sumar exactamente 100%.",
    customSummary: (count: number) => `porcentajes · ${count} persona${count === 1 ? "" : "s"}`,
    effectCustomTitle: "División personalizada",
    effectCustomDetail: (amount: string, count: number) =>
      `${amount} se divide según los porcentajes definidos entre ${count} persona${count === 1 ? "" : "s"}.`
  }
};

export type PodExpenseCopy = (typeof POD_EXPENSE_COPY)[keyof typeof POD_EXPENSE_COPY];

export function buildExpensePresets(currency: CurrencyCode, copy: PodExpenseCopy) {
  const symbol = currency === "USD" ? "$" : "€";
  return [
    { label: `${copy.presetCoffee} ${symbol}5`, text: "coffee 5" },
    { label: `${copy.presetGroceries} ${symbol}45`, text: "groceries 45" },
    { label: `${copy.presetTaxi} ${symbol}18`, text: "taxi 18" },
    { label: `${copy.presetDinner} ${symbol}80`, text: "dinner 80" }
  ];
}

export function buildExpenseEffectCopy({
  copy,
  scenario,
  amount,
  payerName,
  payerGroupName,
  coveredGroupName,
  participantCount,
  groupCount
}: {
  copy: PodExpenseCopy;
  scenario: ExpenseScenario;
  amount: string;
  payerName?: string;
  payerGroupName?: string;
  coveredGroupName?: string;
  participantCount: number;
  groupCount: number;
}) {
  if (scenario === "covered_group") {
    return {
      title: copy.effectCoveredTitle(coveredGroupName),
      detail: copy.effectCoveredDetail(amount, payerName, payerGroupName, coveredGroupName)
    };
  }
  if (scenario === "shared_groups") {
    return {
      title: copy.effectSharedTitle,
      detail: copy.effectSharedDetail(amount, groupCount || 1)
    };
  }
  if (scenario === "custom_split") {
    return {
      title: copy.effectCustomTitle,
      detail: copy.effectCustomDetail(amount, participantCount)
    };
  }
  return {
    title: copy.effectPeopleTitle,
    detail: copy.effectPeopleDetail(amount, participantCount)
  };
}
