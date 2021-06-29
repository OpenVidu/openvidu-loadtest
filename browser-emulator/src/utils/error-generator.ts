export class ErrorGenerator {
	private readonly NO_SUCH_ELEMENT = 'NoSuchElementError';

	constructor() {}
	generateError(error: any) {
		if (error.name === this.NO_SUCH_ELEMENT) {
			const err = { error: 'Publisher cannot create and publish its stream.', message: error };
			return new Error(JSON.stringify(err));
		}
		return error;
	}
}
