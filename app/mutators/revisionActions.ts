import type { RevHeader } from "../messages/RevHeader";

export function revisionCapabilities(headers: RevHeader[], ignoreImmutable = false) {
    let singleton = headers.length === 1;
    let anyImmutable = !ignoreImmutable && headers.some(header => header.is_immutable);
    let singleParent = headers.at(-1)?.parent_ids.length === 1;
    return {
        new_child: headers.length > 0,
        new_parent: !anyImmutable && singleParent,
        edit: singleton && !anyImmutable && !headers[0]?.is_working_copy,
        revert: headers.length > 0,
        duplicate: headers.length > 0,
        abandon: !anyImmutable && headers.length > 0,
        squash: !anyImmutable && singleParent,
        restore: singleton && !anyImmutable && singleParent,
        bookmark: singleton,
    };
}
