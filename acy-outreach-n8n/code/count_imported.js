// Code node: "Count imported" (action = import_history). Runs once for all items.
return [{ json: { imported: $input.all().length, ok: true } }];
