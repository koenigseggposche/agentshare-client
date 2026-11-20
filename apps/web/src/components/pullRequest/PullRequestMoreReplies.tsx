import { useUiText } from "../../i18n/uiText";
import type { PullRequestReplyAvailability } from "./pullRequestDetail.logic";

export function PullRequestMoreReplies({
  moreReplies,
  hasMoreReplies,
  url,
}: PullRequestReplyAvailability) {
  const uiText = useUiText();
  if (!hasMoreReplies) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-2 py-1 text-xs text-muted-foreground">
      <span>
        {moreReplies > 0
          ? uiText("{0} more {1}", [
              moreReplies.toLocaleString(uiText.language),
              moreReplies === 1 ? "reply" : "replies",
            ])
          : uiText("More replies")}
      </span>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground hover:underline"
        >
          {uiText("View on host")}
        </a>
      ) : null}
    </div>
  );
}
