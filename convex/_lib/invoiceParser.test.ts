import { describe, expect, it } from "vitest";
import {
  detectOperator,
  monthLabelFromPeriod,
  normalizeContractNumber,
  parseInvoiceText,
} from "./invoiceParser";

const BEELINE = [
  'ПАО "ВымпелКом" services@beeline.ru ООО ПКО "Инкас Коллект" Лицевой счет678851728',
  "Счет №101236565660 Дата выставления31 августа 2026 г.",
  "Оплата услуг за период01 августа 2026 г.-31 августа 2026 г.",
  "Договор №678851728 Услуги связи7 968,76руб. НДС 1 753,13руб.",
  "Общая сумма по счету9 721,89руб. Итого к оплате9 721,89руб.",
  "Приложение к счету №101236565660 Дата выставления31 августа 2026 г.",
].join("\n");

const ROSTELECOM = [
  "СЧЕТ № 321001002956/1 от 31.08.2026. За Август 2026 г. л/с 321001002956",
  "По договору (контракту) № 321001002956 от 30.05.2017г.",
  'Продавец ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО "РОСТЕЛЕКОМ"',
  'Покупатель ООО "ТЕХНО ПЛЮС"',
  "ИНН/КПП 2130125646/213001001",
  "Итого начислено: 4379.44 963.48 5342.92",
  "Сумма к оплате: 5342.92",
].join("\n");

const CLASSIC = [
  'Счет на оплату № 518 от 31 Июля 2026',
  'Покупатель: ООО "МКК "ФК", ИНН 2130116899, КПП 213001001',
  "Основание: Договор № 11/2026 от 10.07.2026",
  "1 Абонентская плата за услуги Интернет за июль 2026 г. 1.000 мес 1 220.00 1 220.00",
  "Итого: 2 220.00",
  "В том числе НДС: 105.72",
  "Всего к оплате: 2 220.00",
].join("\n");

const T2 = [
  "Счет за Август 2026 № 126685972/143754 от 31.08.2026",
  "за истекший расчетный период с 01.08.2026 по 31.08.2026",
  "№ Лицевого счета: 126685972",
  'Компания: ООО "МКК "ФК"',
  "Итого к оплате: 5807.33 руб., в том числе НДС (22%): 1047.22 руб.",
].join("\n");

const ER = [
  "АО \"ЭР-Телеком Холдинг\"",
  "Счёт № 210000003223840/1-81 от 31.08.2026",
  "Договор № 100210005617997 от 06.11.2020",
  "Лицевой счёт № 210000003223840",
  'Общество с ограниченной ответственностью "ТЕХНО ПЛЮС"',
  "3 015,99Общая сумма к оплате(рубль): 543,87",
  "в том числе НДС",
].join("\n");

describe("parseInvoiceText", () => {
  it("parses Beeline header", () => {
    const r = parseInvoiceText(BEELINE);
    expect(r.invoiceNo).toBe("101236565660");
    expect(r.invoiceDate).toBe("2026-08-31");
    expect(r.periodStart).toBe("01.08.2026");
    expect(r.periodEnd).toBe("31.08.2026");
    expect(r.contractNumber).toBe("678851728");
    expect(r.accountNumber).toBe("678851728");
    expect(r.total).toBe(9721.89);
    expect(r.vat).toBe(1753.13);
    expect(r.amount).toBe(7968.76);
  });

  it("parses Rostelecom bill", () => {
    const r = parseInvoiceText(ROSTELECOM);
    expect(r.invoiceNo).toBe("321001002956/1");
    expect(r.contractNumber).toBe("321001002956");
    expect(r.subscriberInn).toBe("2130125646");
    expect(r.total).toBe(5342.92);
    expect(r.vat).toBe(963.48);
    expect(r.amount).toBe(4379.44);
  });

  it("parses classic payment invoice", () => {
    const r = parseInvoiceText(CLASSIC);
    expect(r.invoiceNo).toBe("518");
    expect(r.invoiceDate).toBe("2026-07-31");
    expect(r.contractNumber).toBe("11/2026");
    expect(r.subscriberInn).toBe("2130116899");
    expect(r.total).toBe(2220);
    expect(r.vat).toBe(105.72);
  });

  it("parses T2 without contract number", () => {
    const r = parseInvoiceText(T2);
    expect(r.invoiceNo).toBe("126685972/143754");
    expect(r.contractNumber).toBe("");
    expect(r.accountNumber).toBe("126685972");
    expect(r.total).toBe(5807.33);
    expect(r.vat).toBe(1047.22);
    expect(r.notes.join(" ")).toContain("ручное соотнесение");
  });

  it("parses ER-Telecom totals", () => {
    const r = parseInvoiceText(ER);
    expect(r.contractNumber).toBe("100210005617997");
    expect(r.total).toBe(3015.99);
    expect(r.vat).toBe(543.87);
    expect(r.amount).toBe(2472.12);
  });
});

describe("periods", () => {
  it("takes explicit date range, not invoice month", () => {
    const r = parseInvoiceText(
      [
        "Счет на оплату № 5986 от 14 сентября 2026 г.",
        "Основание: 508/ю от 29.04.16",
        "Услуга Доступ в Интернет по адресу за период с 01.10.2026",
        "по 31.10.2026 по договору 508/ю от 29.04.16",
        "Итого: 2 440,00",
        "В том числе НДС 7%: 159,63",
        "Всего к оплате: 2 440,00",
      ].join("\n"),
    );
    expect(r.periodStart).toBe("01.10.2026");
    expect(r.periodEnd).toBe("31.10.2026");
    expect(r.total).toBe(2440);
  });

  it("uses uniform service period for advance bills", () => {
    const r = parseInvoiceText(
      [
        "Счёт № 210000003223840/1-81 от 31.08.2026",
        "Договор № 100210005617997 от 06.11.2020",
        'Общество с ограниченной ответственностью "ТЕХНО ПЛЮС"',
        "Интернет Скорость, абонентская плата, c 01.10.2026 по 31.10.2026 3 015,99",
        "3 015,99Общая сумма к оплате(рубль): 543,87",
      ].join("\n"),
    );
    expect(r.periodStart).toBe("01.10.2026");
    expect(r.periodEnd).toBe("31.10.2026");
    expect(r.notes.join(" ")).toContain("аванс");
  });
});

describe("helpers", () => {
  it("normalizes contract numbers for matching", () => {
    expect(normalizeContractNumber("4101- СВ")).toBe("4101СВ");
    expect(normalizeContractNumber("52_15_000001013355")).toBe("5215000001013355");
  });

  it("detects operator by markers", () => {
    expect(detectOperator(BEELINE)).toBe("Вымпелком (Билайн)");
    expect(detectOperator(ROSTELECOM)).toBe("Ростелеком");
    expect(detectOperator(CLASSIC)).toBe("");
  });

  it("builds month label", () => {
    expect(monthLabelFromPeriod("31.08.2026")).toBe("Август 2026");
    expect(monthLabelFromPeriod("")).toBe("текущий период");
  });
});
