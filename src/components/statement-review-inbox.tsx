import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Inbox, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  answerStatementReviewItem,
  dismissStatementReviewItem,
  listStatementReviewItems,
} from "@/lib/statement-review.functions";

type ReviewOption = { value: string; label: string };
type ReviewItem = {
  id: string;
  review_type: string;
  priority: number;
  prompt: string;
  options: ReviewOption[];
  affected_raw_transaction_ids: string[];
};

export function StatementReviewInbox() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listStatementReviewItems);
  const answerFn = useServerFn(answerStatementReviewItem);
  const dismissFn = useServerFn(dismissStatementReviewItem);
  const query = useQuery({
    queryKey: ["statement-review-inbox"],
    queryFn: () => listFn() as Promise<ReviewItem[]>,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["statement-review-inbox"] });
  const answer = useMutation({
    mutationFn: (input: { itemId: string; answer: string }) => answerFn({ data: input }),
    onSuccess: (result) => {
      toast.success(
        `Updated ${result.affectedTransactions} transaction${result.affectedTransactions === 1 ? "" : "s"}`,
      );
      void refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not save the answer"),
  });
  const dismiss = useMutation({
    mutationFn: (itemId: string) => dismissFn({ data: { itemId } }),
    onSuccess: () => void refresh(),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not dismiss the item"),
  });
  const items = query.data ?? [];

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Inbox className="h-5 w-5 text-primary" /> Statement review inbox
          {items.length > 0 && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700">
              {items.length}
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Imports are never held hostage by dozens of questions. High-impact exceptions wait here
          and one answer updates the whole matching group.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {query.isLoading && <p className="text-sm text-muted-foreground">Loading review items…</p>}
        {query.isError && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" /> Could not load the review inbox.
          </div>
        )}
        {!query.isLoading && !query.isError && items.length === 0 && (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" /> No statement exceptions need
            attention.
          </div>
        )}
        {items.slice(0, 20).map((item) => {
          const options = Array.isArray(item.options) ? item.options : [];
          const count = Array.isArray(item.affected_raw_transaction_ids)
            ? item.affected_raw_transaction_ids.length
            : 0;
          return (
            <div
              key={item.id}
              className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{item.prompt}</p>
                <p className="text-xs text-muted-foreground">
                  {count} transaction{count === 1 ? "" : "s"} · priority {item.priority}
                </p>
              </div>
              {options.length > 0 ? (
                <div className="flex items-center gap-2">
                  <Select
                    disabled={answer.isPending}
                    onValueChange={(value) => answer.mutate({ itemId: item.id, answer: value })}
                  >
                    <SelectTrigger className="w-full sm:w-64">
                      <SelectValue placeholder="Choose an answer" />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {item.review_type === "destination_card" && (
                    <a
                      className="whitespace-nowrap text-xs text-primary underline"
                      href="/accounts"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Add card
                    </a>
                  )}
                </div>
              ) : (
                <Button asChild variant="outline" size="sm">
                  <a href="/accounts">Add card account</a>
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                aria-label="Dismiss review item"
                disabled={dismiss.isPending}
                onClick={() => dismiss.mutate(item.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
        {items.length > 20 && (
          <p className="text-xs text-muted-foreground">Showing the 20 highest-priority items.</p>
        )}
      </CardContent>
    </Card>
  );
}
