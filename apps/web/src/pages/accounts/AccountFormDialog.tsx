import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId, type ReactNode } from "react";
import { useForm, type Resolver } from "react-hook-form";
import {
  ACCOUNT_TYPES,
  createAccountSchema,
  updateAccountSchema,
  type Account,
  type CreateAccountInput,
  type UpdateAccountInput,
} from "@financial-management/shared";
import { useCreateAccount, useUpdateAccount } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ACCOUNT_TYPE_LABELS } from "@/lib/labels";

const selectClass =
  "h-10 w-full rounded-control border border-input bg-card px-3 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

const textareaClass =
  "flex min-h-20 w-full rounded-control border border-input bg-card px-3 py-2 font-sans text-base transition-[background-color,color,box-shadow,border-color] duration-300 ease-in-out placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

const isBlank = (v: unknown) => typeof v === "string" && v.trim() === "";
/** Edit: a cleared field is sent as `null` (PATCH clears it). */
const emptyAsNull = { setValueAs: (v: unknown) => (isBlank(v) ? null : v) };
/** Create: a blank optional field is simply omitted. */
const emptyAsUndefined = {
  setValueAs: (v: unknown) => (isBlank(v) ? undefined : v),
};

type FormValues = UpdateAccountInput;

function defaultsFor(account?: Account): FormValues {
  if (!account) return { name: "", type: "checking", openingBalance: "0.00" };
  return {
    name: account.name,
    type: account.type,
    institutionName: account.institutionName,
    accountMask: account.accountMask,
    openingBalance: account.openingBalance,
    creditLimit: account.creditLimit,
    notes: account.notes,
    isActive: account.isActive,
  };
}

interface AccountFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits this account; otherwise it creates a new one. */
  account?: Account;
}

export function AccountFormDialog({ open, onOpenChange, account }: AccountFormDialogProps) {
  const isEdit = Boolean(account);
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const mutation = isEdit ? updateAccount : createAccount;
  const id = useId();

  const form = useForm<FormValues>({
    // The two shared schemas differ only in optionality/nullability; both validate FormValues.
    resolver: (isEdit ? zodResolver(updateAccountSchema) : zodResolver(createAccountSchema)) as Resolver<FormValues>,
    defaultValues: defaultsFor(account),
  });
  const { register, handleSubmit, reset, watch, formState } = form;
  const errors = formState.errors;
  const blank = isEdit ? emptyAsNull : emptyAsUndefined;

  const { reset: resetCreate } = createAccount;
  const { reset: resetUpdate } = updateAccount;
  useEffect(() => {
    if (!open) return;
    reset(defaultsFor(account));
    resetCreate();
    resetUpdate();
    // Re-seed only when the dialog opens or switches account, not on every account refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, account?.accountId]);

  const type = watch("type");
  const isActive = watch("isActive");
  const isCredit = type === "credit";

  const onSubmit = handleSubmit(async (values) => {
    if (account) {
      await updateAccount.mutateAsync({ accountId: account.accountId, ...values });
    } else {
      await createAccount.mutateAsync(values as CreateAccountInput);
    }
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "עריכת חשבון" : "חשבון חדש"}</DialogTitle>
          <DialogDescription>{isEdit ? "עדכנו את פרטי החשבון" : "הזינו את פרטי החשבון"}</DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4" noValidate>
          <Field label="שם החשבון" htmlFor={`${id}-name`} error={errors.name?.message}>
            <Input id={`${id}-name`} autoComplete="off" {...register("name")} />
          </Field>

          <Field label="סוג חשבון" htmlFor={`${id}-type`} error={errors.type?.message}>
            <select id={`${id}-type`} className={selectClass} {...register("type")}>
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ACCOUNT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="מוסד פיננסי" htmlFor={`${id}-institution`} error={errors.institutionName?.message}>
            <Input id={`${id}-institution`} autoComplete="off" {...register("institutionName", blank)} />
          </Field>

          <Field label="ספרות אחרונות" htmlFor={`${id}-mask`} error={errors.accountMask?.message}>
            <Input id={`${id}-mask`} dir="ltr" autoComplete="off" {...register("accountMask", blank)} />
          </Field>

          <Field
            label="יתרת פתיחה"
            htmlFor={`${id}-opening`}
            error={errors.openingBalance?.message}
            hint={isCredit ? "ניתן להזין ערך שלילי" : undefined}
          >
            <Input
              id={`${id}-opening`}
              type="text"
              dir="ltr"
              inputMode={isCredit ? "text" : "decimal"}
              autoComplete="off"
              className="tabular-nums"
              {...register("openingBalance")}
            />
          </Field>

          {isCredit ? (
            <Field label="מסגרת אשראי" htmlFor={`${id}-limit`} error={errors.creditLimit?.message}>
              <Input
                id={`${id}-limit`}
                type="text"
                dir="ltr"
                inputMode="decimal"
                autoComplete="off"
                className="tabular-nums"
                {...register("creditLimit", blank)}
              />
            </Field>
          ) : null}

          <Field label="הערות" htmlFor={`${id}-notes`} error={errors.notes?.message}>
            <textarea id={`${id}-notes`} rows={3} className={textareaClass} {...register("notes", blank)} />
          </Field>

          {isEdit ? (
            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" className="size-4 accent-[var(--color-primary)]" {...register("isActive")} />
                חשבון פעיל
              </label>
              {isActive === false ? (
                <p className="text-xs font-medium text-muted-foreground">חשבון בארכיון לא יוצג ברשימות</p>
              ) : null}
            </div>
          ) : null}

          {mutation.error ? (
            <p className="text-sm font-semibold text-negative" role="alert">
              {mutation.error.message}
            </p>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                ביטול
              </Button>
            </DialogClose>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "שומר…" : "שמירה"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs font-medium text-muted-foreground">{hint}</p> : null}
      <FieldError message={error} />
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-xs font-bold text-negative" role="alert">
      {message}
    </p>
  );
}
