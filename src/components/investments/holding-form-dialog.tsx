// ---------------------------------------------------------------------------
// Investments — add / edit a holding
//
// A "holding" is one position inside an investment account: a scheme, a stock, a
// gold purchase, a PPF account. Quantity and average price are DERIVED from the
// ledger once transactions exist, so this dialog only lets you type them while
// the ledger is empty — see the note beside those two fields.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { GROUP_LABELS } from "@/lib/account-types";
import {
  ASSET_CLASSES,
  assetClassForAccountCategory,
  assetClassDef,
  type AssetClass,
  type InvestmentAccountRef,
} from "@/lib/investments-types";
import { upsertHolding } from "@/lib/investments.functions";

/** ASSET_CLASSES grouped by their account-type group, so the picker reads like the sidebar. */
const GROUPED_ASSET_CLASSES = (() => {
  const order: string[] = [];
  const byGroup = new Map<string, typeof ASSET_CLASSES[number][]>();
  for (const a of ASSET_CLASSES) {
    if (!byGroup.has(a.group)) {
      byGroup.set(a.group, []);
      order.push(a.group);
    }
    byGroup.get(a.group)!.push(a);
  }
  return order.map((g) => ({
    group: g,
    label: GROUP_LABELS[g as keyof typeof GROUP_LABELS] ?? "Other",
    items: byGroup.get(g)!,
  }));
})();

/** Asset class specific field visibility & contextual label customization. */
function getAssetClassFormConfig(assetClass: AssetClass) {
  switch (assetClass) {
    case "equity_mf":
    case "debt_mf":
    case "hybrid_mf":
    case "elss":
    case "index_etf":
      return {
        isDepositScheme: false,
        showIsin: true,
        showFolio: true,
        showSector: false,
        showUnitsLabel: true,
        symbolLabel: "Scheme Code / Ticker",
        symbolPlaceholder: "e.g. PARAGPARIKHFLEXICAP",
        nameLabel: "Scheme Display Name",
        namePlaceholder: "e.g. Parag Parikh Flexi Cap — Direct Growth",
        priceLabel: "Current NAV",
        folioLabel: "Folio Number",
        folioPlaceholder: "1234567/89",
      };
    case "stocks":
    case "reit_invit":
      return {
        isDepositScheme: false,
        showIsin: true,
        showFolio: false,
        showSector: true,
        showUnitsLabel: true,
        symbolLabel: "Ticker Symbol",
        symbolPlaceholder: "e.g. RELIANCE or INFYS",
        nameLabel: "Company / Instrument Name",
        namePlaceholder: "e.g. Reliance Industries Ltd",
        priceLabel: "Current Share Price",
        folioLabel: "",
        folioPlaceholder: "",
      };
    case "gold_sgb":
    case "gold_digital":
    case "gold_physical":
      return {
        isDepositScheme: false,
        showIsin: assetClass === "gold_sgb",
        showFolio: false,
        showSector: false,
        showUnitsLabel: true,
        symbolLabel: "Gold Item / Series Code",
        symbolPlaceholder: assetClass === "gold_sgb" ? "e.g. SGB202122-SERIES-V" : "e.g. 24K-GOLD-BAR",
        nameLabel: "Description",
        namePlaceholder: "e.g. 24K Gold Coin (10g)",
        priceLabel: "Current Price per Gram",
        folioLabel: "",
        folioPlaceholder: "",
      };
    case "ppf":
    case "epf":
    case "fd_rd":
    case "post_office":
      return {
        isDepositScheme: true,
        showIsin: false,
        showFolio: true,
        showSector: false,
        showUnitsLabel: false,
        symbolLabel: "Deposit / Scheme Identifier",
        symbolPlaceholder: "e.g. HDFC-FD-01 or SBI-PPF-ACC",
        nameLabel: "Deposit / Scheme Name",
        namePlaceholder: "e.g. HDFC 3-Yr Fixed Deposit",
        priceLabel: "",
        folioLabel: "Account / FD Receipt No.",
        folioPlaceholder: "e.g. FD-987654321",
      };
    case "nps":
    case "bonds":
      return {
        isDepositScheme: false,
        showIsin: assetClass === "bonds",
        showFolio: true,
        showSector: false,
        showUnitsLabel: true,
        symbolLabel: "Scheme / Bond Identifier",
        symbolPlaceholder: "e.g. NPS-TIER-1 or 7.75-GOI-BOND",
        nameLabel: "Scheme / Bond Name",
        namePlaceholder: "e.g. NPS Tier 1 (HDFC Pension)",
        priceLabel: "Current Unit / NAV Price",
        folioLabel: "PRAN / Account No.",
        folioPlaceholder: "e.g. 110012345678",
      };
    case "crypto":
    case "other":
    default:
      return {
        isDepositScheme: false,
        showIsin: false,
        showFolio: false,
        showSector: true,
        showUnitsLabel: true,
        symbolLabel: "Symbol / Short Name",
        symbolPlaceholder: "e.g. BTC or ASSET-CODE",
        nameLabel: "Display Name",
        namePlaceholder: "e.g. Bitcoin or Custom Asset",
        priceLabel: "Current Price",
        folioLabel: "",
        folioPlaceholder: "",
      };
  }
}

export function HoldingFormDialog({
  open,
  onOpenChange,
  initial,
  accounts,
  defaultAccountId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** A HoldingRow when editing, undefined when adding. */
  initial?: any;
  accounts: InvestmentAccountRef[];
  defaultAccountId?: string;
}) {
  const isEdit = !!initial?.id;
  /** Quantity/avg price are ledger-derived; only editable before the ledger exists. */
  const hasLedger = Number(initial?.txnCount ?? 0) > 0;

  const firstAccountId = accounts[0]?.id ?? "";
  const [accountId, setAccountId] = useState<string>(initial?.account_id ?? defaultAccountId ?? firstAccountId);
  const [assetClass, setAssetClass] = useState<AssetClass>((initial?.asset_class as AssetClass) ?? "equity_mf");
  const [symbol, setSymbol] = useState(initial?.symbol ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [isin, setIsin] = useState(initial?.isin ?? "");
  const [folio, setFolio] = useState(initial?.folio_number ?? "");
  const [sector, setSector] = useState(initial?.sector ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? "INR");
  const [unitsLabel, setUnitsLabel] = useState(initial?.units_label ?? "");
  const [quantity, setQuantity] = useState<string>(String(initial?.quantity ?? ""));
  const [avgPrice, setAvgPrice] = useState<string>(String(initial?.avg_price ?? ""));
  const [currentPrice, setCurrentPrice] = useState<string>(String(initial?.current_price ?? ""));
  const [targetPct, setTargetPct] = useState<string>(
    initial?.target_allocation_pct == null ? "" : String(initial.target_allocation_pct),
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [isActive, setIsActive] = useState<boolean>(initial?.is_active ?? true);

  useEffect(() => {
    if (!open) return;
    const ac = (initial?.asset_class as AssetClass) ?? "equity_mf";
    setAccountId(initial?.account_id ?? defaultAccountId ?? firstAccountId);
    setAssetClass(ac);
    setSymbol(initial?.symbol ?? "");
    setName(initial?.name ?? "");
    setIsin(initial?.isin ?? "");
    setFolio(initial?.folio_number ?? "");
    setSector(initial?.sector ?? "");
    setCurrency(initial?.currency ?? "INR");
    setUnitsLabel(initial?.units_label ?? "");
    setQuantity(String(initial?.quantity ?? ""));
    setAvgPrice(String(initial?.avg_price ?? ""));
    setCurrentPrice(String(initial?.current_price ?? ""));
    setTargetPct(initial?.target_allocation_pct == null ? "" : String(initial.target_allocation_pct));
    setNotes(initial?.notes ?? "");
    setIsActive(initial?.is_active ?? true);
  }, [open, initial, defaultAccountId, firstAccountId]);

  // Picking an account on a NEW holding pre-selects the matching asset class —
  // choose "HDFC MF" and you get Equity MF, not whatever was left over.
  useEffect(() => {
    if (isEdit || !open || !accountId) return;
    const acc = accounts.find((a) => a.id === accountId);
    if (acc?.category) {
      const newAc = assetClassForAccountCategory(acc.category);
      setAssetClass(newAc);
    }
  }, [accountId, accounts, isEdit, open]);

  /** Helper to change asset class and clear fields that are invalid for the new class. */
  const handleAssetClassChange = (newAc: AssetClass) => {
    setAssetClass(newAc);
    const newCfg = getAssetClassFormConfig(newAc);
    if (!newCfg.showIsin) setIsin("");
    if (!newCfg.showFolio) setFolio("");
    if (!newCfg.showSector) setSector("");
    if (!newCfg.showUnitsLabel) setUnitsLabel("");
    if (newCfg.isDepositScheme) {
      setAvgPrice("1");
      setCurrentPrice("1");
    }
  };

  const config = useMemo(() => getAssetClassFormConfig(assetClass), [assetClass]);
  const def = assetClassDef(assetClass);
  const effectiveUnits = unitsLabel.trim() || def.unitsLabel;
  const qc = useQueryClient();
  const save = useServerFn(upsertHolding);

  const mut = useMutation({
    mutationFn: (data: any) => save({ data }),
    onSuccess: () => {
      toast.success(isEdit ? "Holding updated" : "Holding added");
      qc.invalidateQueries();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save the holding"),
  });

  const accountLabel = useMemo(() => {
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc) return "";
    return [acc.name, acc.institution].filter(Boolean).join(" · ");
  }, [accountId, accounts]);

  const submit = () => {
    if (!accountId) return toast.error("Pick an investment account first");
    if (!symbol.trim()) return toast.error(`Enter ${config.symbolLabel.toLowerCase()}`);

    const target = targetPct.trim() === "" ? null : Number(targetPct);
    if (target != null && (!Number.isFinite(target) || target < 0 || target > 100)) {
      return toast.error("Target allocation must be between 0 and 100");
    }

    const payload: Record<string, unknown> = {
      id: initial?.id,
      account_id: accountId,
      symbol: symbol.trim(),
      name: name.trim() || null,
      asset_class: assetClass,
      isin: config.showIsin ? isin.trim() || null : null,
      folio_number: config.showFolio ? folio.trim() || null : null,
      currency: currency || "INR",
      units_label: config.showUnitsLabel ? unitsLabel.trim() || null : null,
      sector: config.showSector ? sector.trim() || null : null,
      target_allocation_pct: target,
      notes: notes.trim() || null,
      is_active: isActive,
    };

    // Deposit schemes (FD, RD, PPF, EPF) have 1-to-1 rupee balance mapping (quantity = balance, price = 1).
    if (config.isDepositScheme) {
      if (!hasLedger) {
        if (quantity.trim() !== "") {
          const bal = Number(quantity) || 0;
          payload.quantity = bal;
          payload.avg_price = 1;
        }
      }
      payload.current_price = 1;
    } else {
      if (!hasLedger) {
        if (quantity.trim() !== "") payload.quantity = Number(quantity) || 0;
        if (avgPrice.trim() !== "") payload.avg_price = Number(avgPrice) || 0;
      }
      if (currentPrice.trim() !== "") payload.current_price = Number(currentPrice) || 0;
    }

    mut.mutate(payload);
  };

  const noAccounts = accounts.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit holding" : "Add holding"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Rename it, retag the asset class, or set a target allocation."
              : "One position inside an investment account — a scheme, a stock, or a gold purchase."}
          </DialogDescription>
        </DialogHeader>

        {noAccounts ? (
          <div className="flex gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              You need an investment account first — a mutual fund, stocks, gold, PPF, EPF, NPS, FD or
              post-office account. Add one on the Accounts page, then come back here.
            </span>
          </div>
        ) : (
          <div className="grid gap-3">
            <div>
              <Label>Account</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose account" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {[a.name, a.institution].filter(Boolean).join(" · ") || "Untitled account"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isEdit && accountLabel && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Moving a holding between accounts also moves its whole ledger.
                </p>
              )}
            </div>

            <div>
              <Label>Asset class</Label>
              <Select value={assetClass} onValueChange={(v) => handleAssetClassChange(v as AssetClass)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {GROUPED_ASSET_CLASSES.map((g) => (
                    <SelectGroup key={g.group}>
                      <SelectLabel>{g.label}</SelectLabel>
                      {g.items.map((a) => (
                        <SelectItem key={a.value} value={a.value}>
                          {a.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                {config.isDepositScheme ? (
                  "Denominated directly in ₹ balance."
                ) : (
                  <>
                    Priced in {def.unitsLabel}.{" "}
                    {def.ltcgMonths > 0
                      ? `Gains turn long-term after ${def.ltcgMonths} months.`
                      : "No short/long-term capital-gains split for this type."}
                  </>
                )}
              </p>
            </div>

            <div>
              <Label>{config.symbolLabel}</Label>
              <Input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder={config.symbolPlaceholder}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Must be unique within the account — this is how prices and the ledger are matched.
              </p>
            </div>

            <div>
              <Label>{config.nameLabel}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={config.namePlaceholder}
              />
            </div>

            {(config.showIsin || config.showFolio) && (
              <div className="grid grid-cols-2 gap-2">
                {config.showIsin && (
                  <div className={!config.showFolio ? "col-span-2" : ""}>
                    <Label>ISIN (optional)</Label>
                    <Input value={isin} onChange={(e) => setIsin(e.target.value)} placeholder="INF879O01019" />
                  </div>
                )}
                {config.showFolio && (
                  <div className={!config.showIsin ? "col-span-2" : ""}>
                    <Label>{config.folioLabel} (optional)</Label>
                    <Input value={folio} onChange={(e) => setFolio(e.target.value)} placeholder={config.folioPlaceholder} />
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["INR", "USD", "EUR", "GBP", "AED", "SGD"].map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {config.showUnitsLabel ? (
                <div>
                  <Label>Units label</Label>
                  <Input
                    value={unitsLabel}
                    onChange={(e) => setUnitsLabel(e.target.value)}
                    placeholder={def.unitsLabel}
                  />
                </div>
              ) : config.showSector ? (
                <div>
                  <Label>Sector (optional)</Label>
                  <Input value={sector} onChange={(e) => setSector(e.target.value)} placeholder="Banking" />
                </div>
              ) : null}
            </div>

            {config.isDepositScheme ? (
              <div>
                <Label>Current Balance / Principal (₹)</Label>
                <Input
                  type="number"
                  step="any"
                  min={0}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  disabled={hasLedger}
                  placeholder="0"
                />
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    step="any"
                    min={0}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    disabled={hasLedger}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label>Avg cost / {effectiveUnits}</Label>
                  <Input
                    type="number"
                    step="any"
                    min={0}
                    value={avgPrice}
                    onChange={(e) => setAvgPrice(e.target.value)}
                    disabled={hasLedger}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label>{config.priceLabel}</Label>
                  <Input
                    type="number"
                    step="any"
                    min={0}
                    value={currentPrice}
                    onChange={(e) => setCurrentPrice(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
            )}
            <p className="flex gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {hasLedger
                ? "Balance / quantity is computed from the ledger (FIFO), so it is read-only here. Log a contribution or interest transaction instead."
                : "Set an opening position here, or leave at zero and build it up from transactions."}
            </p>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Target allocation %</Label>
                <Input
                  type="number"
                  step="any"
                  min={0}
                  max={100}
                  value={targetPct}
                  onChange={(e) => setTargetPct(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Switch checked={isActive} onCheckedChange={setIsActive} />
                  <span>{isActive ? "Active" : "Closed"}</span>
                </label>
              </div>
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={mut.isPending || noAccounts}>
            {mut.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


